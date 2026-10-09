import type { Pool, PoolClient } from "pg";
import type { Decision, Lead } from "./types";
import { audit, getLead, saveLead, saveOverride } from "./db";
import { buildHandoffMessage, sendTelegram } from "./handoff";
import { inr } from "./format";
import { assignDesigner } from "./pipeline";
import { bookingUrl } from "./calendly";

export function deriveStatus(l: Lead): Lead["status"] {
  if (l.projectOutcome === "WON") return "PROJECT_WON";
  if (l.projectOutcome === "LOST") return "PROJECT_LOST";
  if (l.consultationStatus === "SCHEDULED" || l.consultationStatus === "COMPLETED" || l.consultationStatus === "NO_SHOW") return "CONSULTATION";
  if (l.designerContactedAt) return "DESIGNER_CONTACTED";
  return l.decision ?? "NEW";
}

export type ActionName = "acknowledge" | "contacted" | "schedule" | "complete" | "noshow" | "won" | "lost" | "override" | "resend";

export interface ActionInput {
  action: ActionName;
  user: string;
  at?: string;
  value?: number;
  reason?: string;
  status?: Decision;
  when?: string;
}

/**
 * Every outcome is a human action, recorded with who and when. The AI cannot call these.
 * "won" requires a person's name and a project value.
 */
export async function applyAction(leadOrId: Lead | string, input: ActionInput, opts: { q?: Pool | PoolClient; deliver?: boolean; appUrl?: string } = {}): Promise<Lead> {
  const l = typeof leadOrId === "string" ? await getLead(leadOrId) : leadOrId;
  if (!l) throw new Error("Lead not found");
  const user = (input.user || "").trim();
  if (!user) throw new Error("Record who is making this change");
  const at = input.at ?? new Date().toISOString();
  const ev = (type: string, message: string, data?: Record<string, unknown>, severity: "info" | "warn" | "error" = "info") =>
    audit({ leadId: l.id, at, type, actor: user, message, data, severity }, opts.q);

  switch (input.action) {
    case "acknowledge":
      if (l.designerHandoffStatus !== "SENT") throw new Error("Nothing to acknowledge — handoff not sent");
      l.designerHandoffStatus = "ACKNOWLEDGED"; l.handoffAckAt = at;
      await ev("HANDOFF_ACKNOWLEDGED", `${user} acknowledged the handoff`);
      break;
    case "contacted":
      l.designerContactedAt = at;
      if (l.designerHandoffStatus === "SENT") { l.designerHandoffStatus = "ACKNOWLEDGED"; l.handoffAckAt = l.handoffAckAt ?? at; }
      await ev("DESIGNER_CONTACTED", `${user} spoke to the customer`);
      break;
    case "schedule":
      l.consultationStatus = "SCHEDULED"; l.consultationAt = input.when ?? at; l.consultationSource = "manual";
      if (!l.designerContactedAt) l.designerContactedAt = at;
      await ev("CONSULTATION_SCHEDULED", `Consultation scheduled manually${input.when ? ` for ${new Date(input.when).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}` : ""}`);
      break;
    case "complete":
      l.consultationStatus = "COMPLETED"; l.consultationAt = l.consultationAt ?? at;
      if (!l.designerContactedAt) l.designerContactedAt = at;
      await ev("CONSULTATION_COMPLETED", "Consultation completed");
      break;
    case "noshow":
      l.consultationStatus = "NO_SHOW";
      await ev("CONSULTATION_NO_SHOW", "Customer did not attend the consultation", undefined, "warn");
      break;
    case "won": {
      const v = Number(input.value);
      if (!Number.isFinite(v) || v <= 0) throw new Error("Enter the signed project value to mark a project won");
      l.projectOutcome = "WON"; l.projectValue = Math.round(v); l.outcomeRecordedBy = user; l.outcomeAt = at;
      await ev("PROJECT_WON", `Project won — ${inr(v)}`, { value: v });
      break;
    }
    case "lost":
      l.projectOutcome = "LOST"; l.projectValue = null; l.outcomeRecordedBy = user; l.outcomeAt = at;
      await ev("PROJECT_LOST", `Project lost${input.reason ? ` — ${input.reason}` : ""}`, { reason: input.reason });
      break;
    case "override": {
      const to = input.status;
      if (!to) throw new Error("Choose the human decision");
      if (!input.reason?.trim()) throw new Error("An override needs a reason");
      const from = l.decision ?? "NONE";
      await saveOverride({ leadId: l.id, originalAIStatus: l.aiDecision ?? "NONE", humanStatus: to, reason: input.reason, user, timestamp: at }, opts.q);
      l.decision = to;
      l.qualificationReason = `Human override by ${user}: ${input.reason}`;
      await ev("HUMAN_OVERRIDE", `${user} changed ${from} → ${to}: ${input.reason}`, { from, to, aiDecision: l.aiDecision }, l.aiDecision && l.aiDecision !== to ? "warn" : "info");
      if (l.aiDecision && l.aiDecision !== to && l.aiDecision !== "NEEDS_HUMAN_REVIEW") {
        await ev("QUALIFICATION_ERROR", `AI said ${l.aiDecision}; human decided ${to}`, { ai: l.aiDecision, human: to }, "warn");
      }
      if (to === "QUALIFIED" && l.designerHandoffStatus === "NOT_SENT") await handoff(l, user, at, opts);
      break;
    }
    case "resend":
      await handoff(l, user, at, opts);
      break;
  }
  l.status = deriveStatus(l);
  await saveLead(l, opts.q);
  return l;
}

async function handoff(l: Lead, user: string, at: string, opts: { q?: Pool | PoolClient; deliver?: boolean; appUrl?: string }) {
  l.designerAssigned = l.designerAssigned && !/review/i.test(l.designerAssigned) ? l.designerAssigned : assignDesigner(l, l.id.charCodeAt(l.id.length - 1));
  l.bookingUrl = bookingUrl(l);
  l.handoffMessage = buildHandoffMessage(l, opts.appUrl);
  const res = opts.deliver ? await sendTelegram(l.handoffMessage, l.id) : { ok: true, channel: "simulated" as const, error: undefined };
  if (res.ok) {
    l.designerHandoffStatus = "SENT"; l.handoffChannel = res.channel; l.handoffSentAt = at;
    await audit({ leadId: l.id, at, type: "HANDOFF_SENT", actor: user, message: `${res.channel === "telegram" ? "Telegram" : "Simulated Telegram"} handoff sent to ${l.designerAssigned}`, data: { channel: res.channel } }, opts.q);
  } else {
    await audit({ leadId: l.id, at, type: "HANDOFF_FAILED", actor: user, severity: "error", message: `Telegram handoff failed: ${res.error}` }, opts.q);
    await audit({ leadId: l.id, at, type: "INTEGRATION_FAILURE", actor: "Handoff", severity: "error", message: `Telegram API error: ${res.error}` }, opts.q);
  }
}
