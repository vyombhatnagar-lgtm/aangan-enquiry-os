import { auditAll, getBaseline, listCalls, listLeads, listOverrides } from "./db";
import { computeMetrics } from "./metrics";
import { syncCalendly } from "./calendly-sync";

export async function loadAll() {
  // pull any new Calendly bookings first (free-plan sync; throttled, never blocks the page for long)
  await Promise.race([syncCalendly().catch(() => null), new Promise((r) => setTimeout(r, 6000))]);
  const [leads, calls, events, baseline, overrides] = await Promise.all([listLeads(), listCalls(), auditAll(["QUALIFICATION_ERROR", "CUSTOMER_CORRECTION", "PRICING_ESCALATION", "CALL_FAILED", "CALL_ABANDONED", "HANDOFF_FAILED", "INTEGRATION_FAILURE", "LOW_CONFIDENCE", "HUMAN_OVERRIDE", "HUMAN_REVIEW_CREATED", "KB_GAP", "CONSULTATION_CANCELED", "CALENDLY_UNMATCHED", "PRICING_GUARDRAIL_BREACH", "HUMAN_TRANSFER_FAILED"]), getBaseline(), listOverrides()]);
  // Once real enquiries exist, the numbers are computed from real data only — demo and test calls never mix in.
  const real = leads.some((l) => !l.isDemo);
  if (real) {
    const ids = new Set(leads.filter((l) => !l.isDemo).map((l) => l.id));
    const L = leads.filter((l) => ids.has(l.id));
    const C = calls.filter((c) => !c.leadId || ids.has(c.leadId));
    const E = events.filter((e) => !e.leadId || ids.has(e.leadId));
    const O = overrides.filter((o) => ids.has(o.leadId));
    const B = baseline?.source === "DEMO_ASSUMPTION" ? null : baseline;
    return { leads, calls, events: E, baseline: B, overrides: O, realOnly: true, metrics: computeMetrics(L, C, E, B, O) };
  }
  return { leads, calls, events, baseline, overrides, realOnly: false, metrics: computeMetrics(leads, calls, events, baseline, overrides) };
}

export function appUrl(req?: Request) {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (req) { const u = new URL(req.url); return `${u.protocol}//${u.host}`; }
  return undefined;
}
