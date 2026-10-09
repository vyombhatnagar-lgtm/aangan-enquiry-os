import type { AuditEvent, Baseline, Call, Lead, Override } from "./types";
import { fixedCostFor } from "./costs";

export interface Metrics {
  asOf: string;
  health: {
    enquiries: number; answered: number; failed: number; answeredWithin5min: number; pctWithin5min: number;
    avgAnswerSec: number | null; afterHours: number; escalations: number;
    medianDesignerContactMin: number | null; pctContactedWithin1h: number | null; qualCompletion: number;
    calendlyBooked: number; calendlyShare: number | null; medianHandoffToBookingH: number | null; calendlyCancels: number;
  };
  funnel: { key: string; label: string; count: number; fromPrev: number | null; fromTop: number; dropoff: number | null }[];
  business: {
    won: number; lost: number; revenue: number; conversion: number; revenuePerEnquiry: number; revenuePerQualified: number | null;
    pendingOutcomes: number; avgWonValue: number | null; matured: { enquiries: number; won: number; conversion: number | null; days: number };
  };
  cost: { telephony: number; transcription: number; tts: number; llm: number; messaging: number; other: number; fixed: number; variable: number; periodDays: number; total: number; perEnquiry: number; perQualified: number | null; perWon: number | null; minutes: number };
  roi: {
    net: number; grossRoiPct: number | null;
    incremental: null | { liftPP: number; relativeLift: number | null; extraProjects: number; extraRevenue: number; netIncremental: number; roiPct: number | null };
    status: "NO_BASELINE" | "DEMO_BASELINE" | "OBSERVATIONAL" | "TOO_SMALL" | "CAUSAL";
    statusText: string;
  };
  experiment: {
    baseline: Baseline | null;
    automation: { enquiries: number; within5: number; qualified: number; handoffs: number; consultations: number; won: number; revenue: number };
    conversionBaseline: number | null; conversionAutomation: number; lift: number | null; relLift: number | null; pValue: number | null; minSamplePerArm: number | null;
  };
  verdict: { headline: string; tone: "yes" | "maybe" | "no" | "unknown"; detail: string };
  failures: FailureMetrics;
  weekly: { week: string; enquiries: number; qualified: number; won: number; revenue: number; cost: number }[];
}

export interface FailureMetrics {
  counts: Record<string, number>;
  rates: { failureRate: number; disagreementRate: number | null; overrideRate: number };
  warnings: { level: "warn" | "error"; text: string }[];
  missedHandoffs: Lead[];
  reviewQueue: Lead[];
  unanswered: Lead[];
}

const DAY = 86_400_000;

function median(a: number[]) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Two-proportion z-test, two-sided. */
export function twoPropP(x1: number, n1: number, x2: number, n2: number) {
  if (!n1 || !n2) return null;
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (!se) return null;
  const z = Math.abs(x1 / n1 - x2 / n2) / se;
  return 2 * (1 - phi(z));
}
function phi(z: number) {
  // Abramowitz–Stegun
  const t = 1 / (1 + 0.2316419 * z);
  const d = 0.3989423 * Math.exp(-z * z / 2);
  return 1 - d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
}
/** Per-arm n to detect p1→p2 at α=0.05, power 0.8. */
export function sampleSize(p1: number, p2: number) {
  if (p1 <= 0 || p2 <= 0 || p1 === p2) return null;
  const za = 1.96, zb = 0.8416, pb = (p1 + p2) / 2;
  return Math.ceil((za * Math.sqrt(2 * pb * (1 - pb)) + zb * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2 / (p1 - p2) ** 2);
}

export function computeMetrics(leads: Lead[], calls: Call[], events: AuditEvent[], baseline: Baseline | null, overrides: Override[], now = new Date()): Metrics {
  // classification gate: existing-client and vendor calls are answered and logged but are not enquiries
  const L = leads.filter((l) => l.cohort === "AUTOMATION" && (l.callClass ?? "ENQUIRY") === "ENQUIRY");
  const N = L.length;
  const failedLeads = L.filter((l) => l.status === "NEW" && l.aiDecision == null);
  const answered = calls.filter((c) => c.status === "ANSWERED").length;
  const failed = calls.filter((c) => c.status !== "ANSWERED").length;
  const within5 = L.filter((l) => l.responseTimeSeconds != null && l.responseTimeSeconds <= 300 && l.aiDecision != null).length;
  const answerTimes = L.map((l) => l.responseTimeSeconds).filter((x): x is number => x != null);
  const qualifiedLeads = L.filter((l) => l.decision === "QUALIFIED");
  const contactMins = qualifiedLeads.filter((l) => l.designerContactedAt && l.handoffSentAt).map((l) => (new Date(l.designerContactedAt!).getTime() - new Date(l.handoffSentAt!).getTime()) / 60000);
  const contacted = L.filter((l) => l.designerContactedAt);
  const consult = L.filter((l) => ["SCHEDULED", "COMPLETED", "NO_SHOW"].includes(l.consultationStatus));
  const won = L.filter((l) => l.projectOutcome === "WON");
  const lost = L.filter((l) => l.projectOutcome === "LOST");
  const revenue = won.reduce((s, l) => s + (l.projectValue ?? 0), 0);
  const handoffs = L.filter((l) => l.designerHandoffStatus !== "NOT_SENT");

  const steps = [
    { key: "enquiries", label: "Enquiries", count: N },
    { key: "qualified", label: "Qualified", count: qualifiedLeads.length },
    { key: "contacted", label: "Designer contacted", count: contacted.length },
    { key: "consultation", label: "Consultation", count: consult.length },
    { key: "won", label: "Project won", count: won.length },
  ];
  const funnel = steps.map((s, i) => {
    const prev = i ? steps[i - 1].count : null;
    return { ...s, fromPrev: prev ? s.count / prev : null, fromTop: N ? s.count / N : 0, dropoff: prev ? 1 - s.count / prev : null };
  });

  // matured cohort: enquiries old enough for an outcome to plausibly exist
  const maturedDays = 21;
  const matured = L.filter((l) => now.getTime() - new Date(l.enquiryAt).getTime() >= maturedDays * DAY);
  const maturedWon = matured.filter((l) => l.projectOutcome === "WON").length;

  const cost = calls.reduce((a, c) => {
    a.telephony += c.cost.telephony; a.transcription += c.cost.transcription; a.tts += c.cost.tts; a.llm += c.cost.llm; a.messaging += c.cost.messaging; a.other += c.cost.other; a.total += c.cost.total; a.minutes += c.cost.minutes;
    return a;
  }, { telephony: 0, transcription: 0, tts: 0, llm: 0, messaging: 0, other: 0, total: 0, minutes: 0, fixed: 0, variable: 0, periodDays: 0 });
  const first = L.reduce((a, l) => Math.min(a, new Date(l.enquiryAt).getTime()), now.getTime());
  cost.periodDays = Math.max(1, (now.getTime() - first) / DAY);
  cost.variable = cost.total;
  cost.fixed = fixedCostFor(cost.periodDays);
  cost.total = cost.variable + cost.fixed;

  const conversion = N ? won.length / N : 0;
  const avgWon = won.length ? revenue / won.length : null;

  // ROI
  const net = revenue - cost.total;
  const grossRoiPct = cost.total ? (net / cost.total) * 100 : null;
  const bConv = baseline && baseline.enquiries ? baseline.won / baseline.enquiries : null;
  let incremental: Metrics["roi"]["incremental"] = null;
  let pValue: number | null = null;
  if (bConv != null) {
    const lift = conversion - bConv;
    const extraProjects = lift * N;
    const extraRevenue = extraProjects * (avgWon ?? (baseline!.won ? baseline!.revenue / baseline!.won : 0));
    incremental = { liftPP: lift, relativeLift: bConv ? lift / bConv : null, extraProjects, extraRevenue, netIncremental: extraRevenue - cost.total, roiPct: cost.total ? ((extraRevenue - cost.total) / cost.total) * 100 : null };
    pValue = twoPropP(won.length, N, baseline!.won, baseline!.enquiries);
  }
  const minN = bConv != null && conversion > 0 ? sampleSize(bConv, conversion) : null;
  let status: Metrics["roi"]["status"]; let statusText: string;
  if (!baseline) { status = "NO_BASELINE"; statusText = "ROI cannot yet be causally established — no baseline has been entered."; }
  else if (baseline.source === "DEMO_ASSUMPTION") { status = "DEMO_BASELINE"; statusText = "ROI cannot yet be causally established — the baseline is a demo assumption, not Aangan's real numbers."; }
  else if (won.length < 5 || matured.length < 30) { status = "TOO_SMALL"; statusText = `ROI cannot yet be causally established — only ${won.length} won project(s) and ${matured.length} matured enquiries so far.`; }
  else if (baseline.design !== "RANDOMISED") { status = "OBSERVATIONAL"; statusText = "ROI cannot yet be causally established — before/after comparison only. Seasonality, marketing and pricing changes are not controlled for."; }
  else if (pValue != null && pValue < 0.05) { status = "CAUSAL"; statusText = `Randomised comparison, p = ${pValue.toFixed(3)}. The lift is unlikely to be chance.`; }
  else { status = "TOO_SMALL"; statusText = `Randomised, but not yet significant (p = ${pValue?.toFixed(2) ?? "—"}). Keep running.`; }

  // verdict — the one question on the dashboard
  let verdict: Metrics["verdict"];
  if (!won.length && !lost.length) verdict = { headline: "Too early to tell", tone: "unknown", detail: "No project outcomes recorded yet. Revenue appears weeks after the call — keep recording outcomes." };
  else if (bConv == null) verdict = { headline: "Can't tell yet", tone: "unknown", detail: "There is no baseline to compare against. Enter last quarter's manual numbers on the Analytics page." };
  else if (conversion <= bConv) verdict = { headline: "Not yet", tone: "no", detail: `Enquiry → project conversion is ${(conversion * 100).toFixed(1)}%, not above the ${(bConv * 100).toFixed(1)}% baseline.` };
  else if (status === "CAUSAL") verdict = { headline: "Yes", tone: "yes", detail: `Conversion is up ${((conversion - bConv) * 100).toFixed(1)} pp in a randomised comparison.` };
  else verdict = { headline: "Probably — not proven", tone: "maybe", detail: `Conversion is ${(conversion * 100).toFixed(1)}% vs ${(bConv * 100).toFixed(1)}% baseline, but ${status === "DEMO_BASELINE" ? "the baseline is a demo assumption" : status === "TOO_SMALL" ? "the sample is too small" : "this is a before/after comparison"}.` };

  // weekly series (Mon-start, IST-ish)
  const weekKey = (iso: string) => { const d = new Date(new Date(iso).getTime() + 5.5 * 3600_000); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day); return d.toISOString().slice(0, 10); };
  const wk = new Map<string, Metrics["weekly"][number]>();
  for (const l of L) {
    const k = weekKey(l.enquiryAt);
    const w = wk.get(k) ?? { week: k, enquiries: 0, qualified: 0, won: 0, revenue: 0, cost: 0 };
    w.enquiries++; if (l.decision === "QUALIFIED") w.qualified++; if (l.projectOutcome === "WON") { w.won++; w.revenue += l.projectValue ?? 0; }
    w.cost += l.aiCost; wk.set(k, w);
  }
  const weekly = [...wk.values()].sort((a, b) => a.week.localeCompare(b.week));

  return {
    asOf: now.toISOString(),
    health: {
      enquiries: N, answered, failed, answeredWithin5min: within5, pctWithin5min: N ? within5 / N : 0,
      avgAnswerSec: answerTimes.length ? answerTimes.reduce((a, b) => a + b, 0) / answerTimes.length : null,
      afterHours: L.filter((l) => l.afterHours).length, escalations: L.filter((l) => l.aiDecision === "NEEDS_HUMAN_REVIEW").length,
      medianDesignerContactMin: median(contactMins), pctContactedWithin1h: contactMins.length ? contactMins.filter((m) => m <= 60).length / qualifiedLeads.length : null,
      qualCompletion: N ? L.filter((l) => l.aiDecision && l.missingFields.length === 0).length / N : 0,
      calendlyBooked: L.filter((l) => l.calendly).length,
      calendlyShare: consult.length ? consult.filter((l) => l.consultationSource === "calendly").length / consult.length : null,
      medianHandoffToBookingH: median(L.filter((l) => l.calendly && l.handoffSentAt).map((l) => (new Date(l.calendly!.bookedAt).getTime() - new Date(l.handoffSentAt!).getTime()) / 3600_000)),
      calendlyCancels: events.filter((e) => e.type === "CONSULTATION_CANCELED").length,
    },
    funnel,
    business: {
      won: won.length, lost: lost.length, revenue, conversion, revenuePerEnquiry: N ? revenue / N : 0, revenuePerQualified: qualifiedLeads.length ? revenue / qualifiedLeads.length : null,
      pendingOutcomes: qualifiedLeads.filter((l) => l.projectOutcome === "PENDING").length, avgWonValue: avgWon,
      matured: { enquiries: matured.length, won: maturedWon, conversion: matured.length ? maturedWon / matured.length : null, days: maturedDays },
    },
    cost: { ...cost, perEnquiry: N ? cost.total / N : 0, perQualified: qualifiedLeads.length ? cost.total / qualifiedLeads.length : null, perWon: won.length ? cost.total / won.length : null },
    roi: { net, grossRoiPct, incremental, status, statusText },
    experiment: {
      baseline,
      automation: { enquiries: N, within5, qualified: qualifiedLeads.length, handoffs: handoffs.length, consultations: consult.length, won: won.length, revenue },
      conversionBaseline: bConv, conversionAutomation: conversion, lift: bConv != null ? conversion - bConv : null, relLift: bConv ? (conversion - bConv) / bConv : null, pValue, minSamplePerArm: minN,
    },
    verdict,
    failures: computeFailures(L, events, overrides, failedLeads, now),
    weekly,
  };
}

export function computeFailures(L: Lead[], events: AuditEvent[], overrides: Override[], failedLeads: Lead[], now = new Date()): FailureMetrics {
  const count = (types: string[]) => events.filter((e) => types.includes(e.type)).length;
  const missedHandoffs = L.filter((l) => l.decision === "QUALIFIED" && (l.designerHandoffStatus === "NOT_SENT" || (l.designerHandoffStatus === "SENT" && !l.designerContactedAt && now.getTime() - new Date(l.handoffSentAt ?? l.enquiryAt).getTime() > (l.afterHours ? 16 : 2) * 3600_000)));
  const unanswered = failedLeads.filter((l) => !l.designerContactedAt);
  const counts: Record<string, number> = {
    "AI qualification errors": count(["QUALIFICATION_ERROR"]),
    "Human overrides": overrides.length,
    "Customer corrections": count(["CUSTOMER_CORRECTION"]),
    "Pricing escalations": count(["PRICING_ESCALATION"]),
    "Pricing guardrail breaches (voice agent)": count(["PRICING_GUARDRAIL_BREACH"]),
    "Failed calls": count(["CALL_FAILED", "CALL_ABANDONED"]),
    "Missed handoffs": missedHandoffs.length,
    "Integration failures": count(["INTEGRATION_FAILURE", "HANDOFF_FAILED"]),
    "Unanswered calls (no call-back)": unanswered.length,
    "Low-confidence classifications": count(["LOW_CONFIDENCE"]),
    "Calendly cancellations": count(["CONSULTATION_CANCELED"]),
    "Unmatched Calendly bookings": count(["CALENDLY_UNMATCHED"]),
  };
  const decided = L.filter((l) => l.aiDecision && l.aiDecision !== "NEEDS_HUMAN_REVIEW").length;
  const failureRate = L.length ? (counts["Failed calls"] + counts["Integration failures"]) / L.length : 0;
  const disagreementRate = decided ? counts["AI qualification errors"] / decided : null;
  const warnings: FailureMetrics["warnings"] = [];
  if (failureRate > 0.05) warnings.push({ level: "error", text: `Failure rate ${(failureRate * 100).toFixed(1)}% is above the 5% threshold` });
  if (counts["Integration failures"]) warnings.push({ level: "error", text: `${counts["Integration failures"]} handoff/integration failure(s) — check Telegram` });
  if (counts["Pricing guardrail breaches (voice agent)"]) warnings.push({ level: "error", text: `The voice agent quoted ${counts["Pricing guardrail breaches (voice agent)"]} figure(s) not in pricing.md or without the caveat — fix the Vaani prompt` });
  if (missedHandoffs.length) warnings.push({ level: "warn", text: `${missedHandoffs.length} qualified lead(s) not contacted within SLA (2 working hours)` });
  if (disagreementRate != null && disagreementRate > 0.1) warnings.push({ level: "warn", text: `Humans disagreed with ${(disagreementRate * 100).toFixed(0)}% of AI decisions — review qualified.md` });
  if (counts["Unmatched Calendly bookings"]) warnings.push({ level: "warn", text: `${counts["Unmatched Calendly bookings"]} Calendly booking(s) couldn't be matched to an enquiry — check the event feed` });
  if (unanswered.length) warnings.push({ level: "warn", text: `${unanswered.length} failed call(s) never called back` });
  // conversion trend: last 3 weeks of matured leads vs the 3 before
  const age = (l: Lead) => (now.getTime() - new Date(l.enquiryAt).getTime()) / DAY;
  const recent = L.filter((l) => age(l) >= 21 && age(l) < 42), prior = L.filter((l) => age(l) >= 42 && age(l) < 63);
  if (recent.length >= 8 && prior.length >= 8) {
    const r = recent.filter((l) => l.projectOutcome === "WON").length / recent.length, p = prior.filter((l) => l.projectOutcome === "WON").length / prior.length;
    if (r < p * 0.8) warnings.push({ level: "warn", text: `Project conversion fell from ${(p * 100).toFixed(0)}% to ${(r * 100).toFixed(0)}% (matured cohorts)` });
  }
  return {
    counts,
    rates: { failureRate, disagreementRate, overrideRate: L.length ? overrides.length / L.length : 0 },
    warnings,
    missedHandoffs,
    reviewQueue: L.filter((l) => l.decision === "NEEDS_HUMAN_REVIEW" || (l.status === "NEW" && !l.aiDecision && !l.designerContactedAt)),
    unanswered,
  };
}
