import type { PoolClient } from "pg";
import { SEED } from "./personas";

const DEMO_KEEP = new Set(["s01", "s02", "s05", "s07", "s12", "s16", "s18", "s19", "s24", "s29", "s33", "s37"]);
import { runScripted } from "../engine/simulate";
import { completeCall, newId } from "../pipeline";
import { applyAction } from "../actions";
import { applyCalendlyEvent, fakeInviteeCreated } from "../calendly";
import { analyzeCall } from "../intel/analysis";
import { audit, saveBaseline, saveCall, saveLead } from "../db";
import { callCost } from "../costs";
import { isAfterHours, istParts } from "../format";
import type { Lead } from "../types";

export function istToDate(s: string) {
  const [d, t] = s.split(" ");
  return new Date(`${d}T${t}:00+05:30`);
}
const plus = (d: Date | string, min: number) => new Date(new Date(d).getTime() + min * 60_000).toISOString();

/** DEMO baseline. The brief gives no baseline conversion rate, so these are assumptions and are labelled as such everywhere. */
export const DEMO_BASELINE = {
  label: "Manual front desk — July 2026",
  source: "DEMO_ASSUMPTION" as const,
  period: "2026-07-01 → 2026-07-31",
  enquiries: 200,
  responded5min: 22,
  qualified: 74,
  handoffs: 74,
  consultations: 31,
  won: 8,
  revenue: 8 * 1080000,
  design: "PRE_POST" as const,
  notes: "Invented for the demo. 200/month and the 48% no-response-in-48h figure come from the brief; conversion, consultations and revenue do NOT — replace with Aangan's real July numbers.",
  updatedAt: new Date().toISOString(),
};

export async function seedDemo(c: PoolClient, opts: { keepBaseline?: boolean } = {}) {
  let seq = 0;
  // a small, varied demo set — real calls take over the numbers as soon as they arrive
  for (const s of SEED.filter((x) => DEMO_KEEP.has(x.p.key))) {
    const at = istToDate(s.at);
    if (s.failed) {
      const id = newId("AGN", at);
      const callId = newId("CALL", at);
      const p = istParts(at);
      const now = new Date().toISOString();
      const lead: Lead = {
        id, phoneNumber: s.p.phone, enquiryDate: p.date, enquiryTime: p.time, enquiryAt: at.toISOString(), source: "PHONE",
        requirements: [], servicesRequested: [], servicesExcluded: [], status: "NEW", ruleTrace: [], missingFields: ["everything"],
        reviewReasons: [s.failed === "FAILED" ? "Call failed before the agent could speak (SIP timeout)" : "Caller hung up during the greeting"],
        qualificationReason: s.failed === "FAILED" ? "Call failed — no conversation" : "Caller hung up — no conversation",
        recommendedAction: "Call the number back — this is a lost enquiry until someone does.",
        highValue: false, indicativePricingShown: false, designerHandoffStatus: "NOT_SENT", consultationStatus: "NOT_SCHEDULED", projectOutcome: "PENDING",
        responseTimeSeconds: s.failed === "FAILED" ? null : 2.6, aiCost: 0, afterHours: isAfterHours(at), cohort: "AUTOMATION", engine: "rules", isDemo: true, createdAt: now, updatedAt: now,
      };
      const cost = callCost([], { handoff: false, failed: true });
      lead.aiCost = cost.total;
      await saveLead(lead, c);
      await saveCall({ id: callId, leadId: id, phone: s.p.phone, startedAt: at.toISOString(), durationSec: s.failed === "FAILED" ? 0 : 6, status: s.failed, failureReason: lead.reviewReasons[0], afterHours: lead.afterHours, transcript: s.failed === "ABANDONED" ? [{ speaker: "agent", text: "Hi, you've reached Aangan Studio…", at: 2.6 }, { speaker: "system", text: "Caller disconnected", at: 5 }] : [{ speaker: "system", text: "SIP 408 — no media", at: 0 }], cost, engine: "rules" }, c);
      await audit({ leadId: id, callId, at: at.toISOString(), type: "CALL_RECEIVED", actor: "Telephony", message: `Inbound call from ${s.p.phone}` }, c);
      await audit({ leadId: id, callId, at: plus(at, 0.1), type: s.failed === "FAILED" ? "CALL_FAILED" : "CALL_ABANDONED", actor: "Telephony", severity: "error", message: lead.reviewReasons[0] }, c);
      continue;
    }
    const r = runScripted(s.p, at);
    const { lead } = await completeCall({ state: r.state, transcript: r.transcript, events: r.events, phone: s.p.phone, startedAt: at, callId: newId("CALL", at), engine: "rules", isDemo: true, responseTimeSeconds: r.answerSec, deliverHandoff: false, q: c, seq: seq++ });
    const end = plus(lead.handoffSentAt ?? at, 0);
    const o = s.outcome;
    let l = lead;
    if (s.override) l = await applyAction(l, { action: "override", user: s.override.user, status: s.override.to, reason: s.override.reason, at: plus(end, 40) }, { q: c });
    if (s.ack && l.designerHandoffStatus === "SENT") l = await applyAction(l, { action: "acknowledge", user: l.designerAssigned ?? "Designer", at: plus(end, Math.min(12, (o?.contactedAfterMin ?? 30) / 3)) }, { q: c });
    if (o?.contactedAfterMin != null) l = await applyAction(l, { action: "contacted", user: l.designerAssigned ?? "Designer", at: plus(end, o.contactedAfterMin) }, { q: c });
    if (o?.consult) {
      const sched = plus(end, (o.contactedAfterMin ?? 30) + 20);
      if (seq % 3 !== 0 && l.bookingUrl) {
        // most customers book themselves from the Calendly link the designer sends
        const r = await applyCalendlyEvent(fakeInviteeCreated(l, plus(sched, 3 * 24 * 60), sched), { q: c, leads: [l], source: "Calendly (customer, demo seed)" });
        if (r.matched && r.lead) l = r.lead;
      } else {
        l = await applyAction(l, { action: "schedule", user: l.designerAssigned ?? "Designer", at: sched, when: plus(sched, 3 * 24 * 60) }, { q: c });
      }
      if (o.consult === "COMPLETED") l = await applyAction(l, { action: "complete", user: l.designerAssigned ?? "Designer", at: plus(sched, 3 * 24 * 60 + 60) }, { q: c });
      if (o.consult === "NO_SHOW") l = await applyAction(l, { action: "noshow", user: l.designerAssigned ?? "Designer", at: plus(sched, 3 * 24 * 60 + 60) }, { q: c });
    }
    if (o?.won) l = await applyAction(l, { action: "won", user: "Nikhil (demo seed)", value: o.won, at: plus(end, 14 * 24 * 60) }, { q: c });
    if (o?.lost) l = await applyAction(l, { action: "lost", user: "Nikhil (demo seed)", reason: o.lost, at: plus(end, 12 * 24 * 60) }, { q: c });
    if (o || s.override) { l.intel = await analyzeCall(l, r.transcript, { useLLM: false }); l.callClass = l.intel.callClass; await saveLead(l, c); }
  }
  if (!opts.keepBaseline) await saveBaseline(DEMO_BASELINE, c);
}
