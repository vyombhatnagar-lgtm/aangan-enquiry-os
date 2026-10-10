import type { PoolClient, Pool } from "pg";
import type { AgentEvent, AgentState } from "./engine/conversation";
import type { CallState } from "./engine/extract";
import type { Qualification } from "./engine/qualify";
import { fmtMonths } from "./engine/qualify";
import type { AuditEvent, Call, Cohort, Lead, Turn } from "./types";
import { callCost } from "./costs";
import { buildHandoffMessage, sendTelegram } from "./handoff";
import { inr, isAfterHours, istParts } from "./format";
import { audit, saveCall, saveLead } from "./db";
import { getKB } from "./knowledge";
import { bookingUrl } from "./calendly";
import { analyzeCall } from "./intel/analysis";

export const DESIGNERS = ["Ira Kulkarni", "Kabir Shah"];
export const OWNER = "Nikhil";

export interface TimedEvent extends AgentEvent { offset: number }

export function newId(prefix: string, at: Date) {
  const p = istParts(at);
  return `${prefix}-${p.date.slice(2).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export function summarize(cs: CallState, q: Qualification, afterHours: boolean): string {
  const who = cs.name ?? "Caller (name not given)";
  const what = cs.servicesExcluded.length && !cs.servicesRequested.length
    ? `asked about ${cs.servicesExcluded.map((id) => getKB().services.data.excluded.find((e) => e.id === id)?.label.toLowerCase() ?? id).join(", ")}, which Aangan does not provide`
    : `wants ${cs.projectType?.toLowerCase() ?? "interiors (scope unclear)"}${cs.bhk ? ` for a ${cs.bhk} BHK` : ""}${cs.propertyType && cs.propertyType !== "Apartment" ? ` ${cs.propertyType.toLowerCase()}` : ""}${cs.location ? ` in ${cs.location}` : ""}${cs.area ? ` (~${cs.area} sq ft)` : ""}`;
  const s: string[] = [`${who} called${afterHours ? " after hours" : ""} and ${what}.`];
  const tl = cs.timelineMonths != null ? `start in ~${fmtMonths(cs.timelineMonths)} ("${cs.timelineText}")` : cs.timelineText ? `timeline unclear ("${cs.timelineText}")` : null;
  const bd = cs.budgetMax || cs.budgetMin ? `budget ${cs.budgetText}` : cs.budgetText ? `budget unclear ("${cs.budgetText}")` : null;
  if (tl || bd) s.push(`${[tl, bd].filter(Boolean).join("; ")}.`.replace(/^./, (m) => m.toUpperCase()));
  if (cs.requirements.length) s.push(`Mentioned: ${cs.requirements.join(", ").toLowerCase()}.`);
  if (cs.pricingGiven) s.push(`Asked about price — given indicative guidance only, no quote.`);
  if (cs.pricingEscalations.length) s.push(`Pushed for a firm price; told only the design team can quote.`);
  if (cs.corrections.length) s.push(`Corrected themselves on ${cs.corrections.map((c) => c.slot).join(", ")}.`);
  if (cs.contradictions.length) s.push(`Doesn't add up: ${cs.contradictions.join("; ")}.`);
  if (cs.wantsHuman) s.push("Asked to speak to a person.");
  s.push(`AI result: ${q.decision.replace(/_/g, " ").toLowerCase()} (confidence ${q.confidence}).`);
  return s.join(" ");
}

export function leadFromState(st: AgentState, o: { id: string; phone: string; at: Date; cohort?: Cohort; engine: string; isDemo: boolean; responseTimeSeconds: number | null; aiCost: number; summary?: string }): Lead {
  const cs = st.cs;
  const q = st.qualification!;
  const p = istParts(o.at);
  const now = new Date().toISOString();
  const afterHours = isAfterHours(o.at);
  return {
    id: o.id,
    customerName: cs.name ?? null,
    phoneNumber: o.phone,
    enquiryDate: p.date,
    enquiryTime: p.time,
    enquiryAt: o.at.toISOString(),
    source: "PHONE",
    projectType: cs.projectType ?? (cs.servicesExcluded.length ? "Out of scope" : null),
    propertyType: cs.propertyType ?? null,
    projectScope: cs.projectScope ?? null,
    bhk: cs.bhk ?? null,
    location: cs.location ?? null,
    inServiceArea: cs.inServiceArea ?? null,
    approximateArea: cs.area ?? null,
    budget: cs.budgetText ?? null,
    budgetMin: cs.budgetMin ?? null,
    budgetMax: cs.budgetMax ?? null,
    timeline: cs.timelineText ?? null,
    timelineMonths: cs.timelineMonths ?? null,
    requirements: cs.requirements,
    servicesRequested: cs.servicesRequested,
    servicesExcluded: cs.servicesExcluded,
    status: q.decision,
    aiDecision: q.decision,
    decision: q.decision,
    qualificationReason: q.reason,
    confidenceScore: q.confidence,
    ruleTrace: q.rules,
    missingFields: q.missing,
    reviewReasons: q.reviewReasons,
    recommendedAction: q.recommendedAction,
    highValue: q.highValue,
    indicativePricingShown: cs.pricingGiven,
    indicativePricingText: cs.pricingText ?? null,
    conversationSummary: o.summary ?? summarize(cs, q, afterHours),
    designerHandoffStatus: "NOT_SENT",
    consultationStatus: "NOT_SCHEDULED",
    projectOutcome: "PENDING",
    responseTimeSeconds: o.responseTimeSeconds,
    aiCost: o.aiCost,
    afterHours,
    cohort: o.cohort ?? "AUTOMATION",
    engine: o.engine,
    isDemo: o.isDemo,
    createdAt: now,
    updatedAt: now,
  };
}

export function assignDesigner(l: Lead, seq: number) {
  return l.highValue ? `${OWNER} (Principal)` : DESIGNERS[seq % DESIGNERS.length];
}

/**
 * Persists a finished call: lead record, call record (full transcript — never lost), audit trail,
 * and the designer handoff or human-review task.
 */
export async function completeCall(args: {
  state: AgentState; transcript: Turn[]; events: TimedEvent[]; phone: string; startedAt: Date; callId: string; engine: string;
  isDemo: boolean; cohort?: Cohort; responseTimeSeconds: number; deliverHandoff: boolean; analyseWithAI?: boolean; summary?: string; tokens?: { tin: number; tout: number }; q?: Pool | PoolClient; appUrl?: string; seq?: number;
}): Promise<{ lead: Lead; call: Call; audits: AuditEvent[] }> {
  const { state, transcript, startedAt } = args;
  const q = state.qualification!;
  const leadId = newId("AGN", startedAt);
  const handoff = q.decision === "QUALIFIED";
  const cost = callCost(transcript, { handoff, measuredTokens: args.tokens });
  const lead = leadFromState(state, { id: leadId, phone: args.phone, at: startedAt, cohort: args.cohort, engine: args.engine, isDemo: args.isDemo, responseTimeSeconds: args.responseTimeSeconds, aiCost: cost.total, summary: args.summary });
  const durationSec = transcript.length ? transcript[transcript.length - 1].at + 4 : 0;
  const call: Call = { id: args.callId, leadId, phone: args.phone, startedAt: startedAt.toISOString(), durationSec, status: "ANSWERED", afterHours: lead.afterHours, transcript, cost, engine: args.engine };

  const at = (sec: number) => new Date(startedAt.getTime() + sec * 1000).toISOString();
  const A: AuditEvent[] = [];
  const add = (sec: number, type: string, message: string, data?: Record<string, unknown>, severity: AuditEvent["severity"] = "info", actor = "Phone line") =>
    A.push({ leadId, callId: call.id, at: at(sec), type, actor, message, data, severity });

  add(0, "CALL_RECEIVED", `Inbound call from ${args.phone}${lead.afterHours ? " (after hours)" : ""}`, undefined, "info", "Telephony");
  for (const e of args.events) {
    if (e.type === "EXTRACTED") continue; // too chatty for the audit trail; transcript keeps it
    add(e.offset, e.type, e.message, e.data, e.severity);
  }
  const kbUsed = [...new Set(transcript.flatMap((t) => t.meta?.kb ?? []))];
  const endSec = durationSec;
  add(endSec, "SOURCES_USED", `Knowledge used: ${kbUsed.length ? kbUsed.join(" · ") : "qualified.md rules only"}`, { sources: kbUsed, kbHash: { services: getKB().services.hash, pricing: getKB().pricing.hash, qualified: getKB().qualified.hash } });
  if (q.confidence < getKB().qualified.data.confidenceThreshold) add(endSec, "LOW_CONFIDENCE", `Low-confidence classification (${q.confidence})`, undefined, "warn");

  // Call Intelligence layer: classification gate + structured analysis + OpportunityEngine score
  lead.intel = await analyzeCall(lead, transcript, { useLLM: !!args.analyseWithAI });
  lead.callClass = lead.intel.callClass;
  add(endSec, "CALL_ANALYSED", `Call intelligence: ${lead.intel.callClass.toLowerCase().replace(/_/g, " ")} · buyer signals ${lead.intel.buyerSignals} · opportunity ${lead.intel.opportunityScore}/100 (${lead.intel.engine})`, { objections: lead.intel.objections.map((o) => o.type) });
  const nonEnquiry = lead.callClass !== "ENQUIRY";
  if (nonEnquiry) add(endSec, "CLASSIFICATION_GATE", `Not a project enquiry — routed to the studio team and kept out of the funnel: ${lead.intel.classReason}`, undefined, "info", "Classification gate");

  const seq = args.seq ?? Math.floor(Math.random() * 100);
  if (nonEnquiry) {
    lead.designerAssigned = "Studio front desk";
  } else if (handoff) {
    lead.designerAssigned = assignDesigner(lead, seq);
    lead.bookingUrl = bookingUrl(lead);
    lead.handoffMessage = buildHandoffMessage(lead, args.appUrl);
    const res = args.deliverHandoff ? await sendTelegram(lead.handoffMessage, lead.id) : { ok: true, channel: "simulated" as const, error: undefined };
    if (res.ok) {
      lead.designerHandoffStatus = "SENT";
      lead.handoffChannel = res.channel;
      lead.handoffSentAt = at(endSec + 2);
      add(endSec + 2, "HANDOFF_SENT", `${res.channel === "telegram" ? "Telegram" : "Simulated Telegram"} handoff sent to ${lead.designerAssigned}`, { channel: res.channel }, "info", "Handoff");
    } else {
      lead.handoffChannel = res.channel;
      add(endSec + 2, "HANDOFF_FAILED", `Telegram handoff failed: ${res.error}`, { error: res.error }, "error", "Handoff");
      add(endSec + 2, "INTEGRATION_FAILURE", `Telegram API error: ${res.error}`, undefined, "error", "Handoff");
    }
  } else if (q.decision === "NEEDS_HUMAN_REVIEW") {
    lead.designerAssigned = lead.highValue ? `${OWNER} (Principal)` : "Front desk review";
    add(endSec + 1, "HUMAN_REVIEW_CREATED", `Review task created — ${q.reviewReasons[0] ?? "needs a human decision"}`, { reasons: q.reviewReasons, missing: q.missing, next: q.recommendedAction }, "warn", "System");
  } else {
    add(endSec + 1, "NO_HANDOFF", "Not qualified — polite close, no designer handoff", { reason: q.reason }, "info", "System");
  }

  const c = args.q;
  await saveLead(lead, c);
  await saveCall(call, c);
  for (const a of A) await audit(a, c);
  return { lead, call, audits: A };
}

export function describeBudget(l: Lead) {
  if (l.budgetMax) return `${l.budget} (${l.budgetMin && l.budgetMin !== l.budgetMax ? `${inr(l.budgetMin)}–` : ""}${inr(l.budgetMax)})`;
  return l.budget ?? "—";
}
