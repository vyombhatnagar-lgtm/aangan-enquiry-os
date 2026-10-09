import { auditAll, getBaseline, listCalls, listLeads, listOverrides } from "./db";
import { computeMetrics } from "./metrics";

export async function loadAll() {
  const [leads, calls, events, baseline, overrides] = await Promise.all([listLeads(), listCalls(), auditAll(["QUALIFICATION_ERROR", "CUSTOMER_CORRECTION", "PRICING_ESCALATION", "CALL_FAILED", "CALL_ABANDONED", "HANDOFF_FAILED", "INTEGRATION_FAILURE", "LOW_CONFIDENCE", "HUMAN_OVERRIDE", "HUMAN_REVIEW_CREATED", "KB_GAP", "CONSULTATION_CANCELED", "CALENDLY_UNMATCHED", "PRICING_GUARDRAIL_BREACH", "HUMAN_TRANSFER_FAILED"]), getBaseline(), listOverrides()]);
  return { leads, calls, events, baseline, overrides, metrics: computeMetrics(leads, calls, events, baseline, overrides) };
}

export function appUrl(req?: Request) {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (req) { const u = new URL(req.url); return `${u.protocol}//${u.host}`; }
  return undefined;
}
