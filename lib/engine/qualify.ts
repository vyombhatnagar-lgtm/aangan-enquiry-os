import { getKB } from "../knowledge";
import { inr } from "../format";
import type { Decision, RuleResult } from "../types";
import type { CallState } from "./extract";

export interface Qualification {
  decision: Decision;
  reason: string;
  confidence: number;
  rules: RuleResult[];
  missing: string[];
  reviewReasons: string[];
  recommendedAction: string;
  highValue: boolean;
  declineKind?: "service" | "location" | "size" | "budget" | "timing";
}

const FIELD_LABEL: Record<string, string> = {
  projectScope: "project scope", location: "location", approximateArea: "carpet area", budget: "budget", timeline: "timeline",
};

function has(state: CallState, f: string) {
  switch (f) {
    case "projectScope": return !!state.projectScope;
    case "location": return !!state.location;
    case "approximateArea": return !!state.area || state.projectScope === "kitchen_wardrobe";
    case "budget": return state.budgetMax != null || state.budgetMin != null;
    case "timeline": return state.timelineMonths != null;
  }
  return false;
}

/**
 * Evaluates ONLY the rules declared in qualified.md. Anything those rules can't settle goes to a human.
 * Pipeline: service fit → criteria → confidence check → result.
 */
export function qualify(state: CallState): Qualification {
  const q = getKB().qualified.data;
  const pricing = getKB().pricing.data;
  const src = "qualified.md";
  const rules: RuleResult[] = [];
  const reviewReasons: string[] = [];
  const missing = q.requiredFields.filter((f) => !has(state, f)).map((f) => FIELD_LABEL[f] ?? f);
  const budgetTop = state.budgetMax ?? state.budgetMin;
  const highValue = (budgetTop ?? 0) >= q.highValue.minBudget || (state.area ?? 0) >= q.highValue.minSqft;

  for (const rule of q.rules) {
    const base = { id: rule.id, name: rule.name, source: `${src} § ${rule.id}` };
    switch (rule.type) {
      case "service_fit": {
        const ex = [...state.servicesExcluded], pr = [...new Set([...state.servicesRequested, ...(state.projectScope ? [state.projectScope] : [])])];
        const maxOffice = getKB().services.data.provided.find((p) => p.id === "office")?.maxSqft;
        if (state.projectScope === "office" && maxOffice && (state.area ?? 0) > maxOffice) {
          rules.push({ ...base, result: "FAIL", detail: `Office of ${state.area} sq ft is above the ${maxOffice.toLocaleString("en-IN")} sq ft limit for office work`, source: `services.md + ${base.source}` });
          break;
        }
        if (ex.length && !pr.length) rules.push({ ...base, result: "FAIL", detail: `Requested only services Aangan does not provide: ${labels(ex, "excluded").join(", ")}`, source: `services.md + ${base.source}` });
        else if (ex.length && pr.length) rules.push({ ...base, result: "REVIEW", detail: `Mix of provided (${labels(pr, "provided").join(", ")}) and not provided (${labels(ex, "excluded").join(", ")})`, source: `services.md + ${base.source}` });
        else if (state.projectScope) rules.push({ ...base, result: "PASS", detail: `${labels([state.projectScope], "provided")[0]} is listed as provided`, source: `services.md + ${base.source}` });
        else rules.push({ ...base, result: "UNKNOWN", detail: "Could not tell what work is needed", source: base.source });
        break;
      }
      case "location": {
        const min = rule.outsideMinBudget as number;
        if (!state.location) rules.push({ ...base, result: "UNKNOWN", detail: "Location not given" });
        else if (state.inServiceArea === true) rules.push({ ...base, result: "PASS", detail: `${state.location} is in the service area` });
        else if (state.inServiceArea === false) {
          if (budgetTop != null && budgetTop >= min) rules.push({ ...base, result: "PASS", detail: `${state.location} is outside Pune, but budget ${inr(budgetTop)} ≥ ${inr(min)}` });
          else if (budgetTop == null) rules.push({ ...base, result: "UNKNOWN", detail: `${state.location} is outside Pune; rule depends on budget, which is unknown` });
          else rules.push({ ...base, result: "FAIL", detail: `${state.location} is outside Pune and budget ${inr(budgetTop)} < ${inr(min)}` });
        } else rules.push({ ...base, result: "UNKNOWN", detail: `"${state.location}" is not in the service-area list — can't tell` });
        break;
      }
      case "min_size": {
        const scope = state.projectScope;
        if (!scope) { rules.push({ ...base, result: "UNKNOWN", detail: "Scope unknown" }); break; }
        if (scope === "kitchen_wardrobe") {
          const m = rule.kitchenStandaloneMinBudget as number;
          if (budgetTop == null) rules.push({ ...base, result: "UNKNOWN", detail: `Standalone kitchen needs budget ≥ ${inr(m)}; budget unknown` });
          else rules.push({ ...base, result: budgetTop >= m ? "PASS" : "FAIL", detail: `Standalone kitchen, budget ${inr(budgetTop)} vs minimum ${inr(m)}` });
        } else if (scope === "full_home") {
          rules.push({ ...base, result: "PASS", detail: `Full home${state.bhk ? ` (${state.bhk} BHK)` : ""} — meets the "full home" condition` });
        } else if (scope === "office") {
          const m = rule.officeMinSqft as number;
          if (!state.area) rules.push({ ...base, result: "UNKNOWN", detail: `Office needs ≥ ${m} sq ft; area unknown` });
          else rules.push({ ...base, result: state.area >= m ? "PASS" : "FAIL", detail: `Office ${state.area} sq ft vs minimum ${m}` });
        } else {
          const m = rule.homeMinSqft as number;
          if (!state.area) rules.push({ ...base, result: "UNKNOWN", detail: `Needs ≥ ${m} sq ft of work; area unknown` });
          else rules.push({ ...base, result: state.area >= m ? "PASS" : "FAIL", detail: `${state.area} sq ft of work vs minimum ${m}` });
        }
        break;
      }
      case "budget_fit": {
        const scope = state.projectScope;
        if (scope === "kitchen_wardrobe") { rules.push({ ...base, result: "SKIP", detail: "Standalone kitchen — covered by R3" }); break; }
        if (!scope) { rules.push({ ...base, result: "UNKNOWN", detail: "Scope unknown" }); break; }
        const rows = pricing.perSqft.filter((r) => r.scope === scope);
        if (!rows.length) { rules.push({ ...base, result: "UNKNOWN", detail: `No price listed for ${scope}` }); break; }
        const low = Math.min(...rows.map((r) => r.min));
        if (budgetTop == null) { rules.push({ ...base, result: "UNKNOWN", detail: "Budget not given" }); break; }
        const abs = rule.fullHomeAbsoluteMin as number;
        if (scope === "full_home" && budgetTop < abs) { rules.push({ ...base, result: "FAIL", detail: `Full home budget ${inr(budgetTop)} is under the ${inr(abs)} floor` }); break; }
        if (!state.area) { rules.push({ ...base, result: "UNKNOWN", detail: "Area unknown — can't compare budget to the Essential range" }); break; }
        const need = state.area * low * (rule.minRatioOfEssentialLow as number);
        rules.push({ ...base, result: budgetTop >= need ? "PASS" : "FAIL", detail: `Budget ${inr(budgetTop)} vs ${Math.round((rule.minRatioOfEssentialLow as number) * 100)}% of Essential low end (${state.area} × ₹${low} × 0.7 = ${inr(Math.round(need))})`, source: `${base.source} + pricing.md` });
        break;
      }
      case "timeline": {
        const max = rule.maxMonths as number;
        if (state.timelineMonths == null) rules.push({ ...base, result: "UNKNOWN", detail: state.timelineText ? `Timeline unclear: "${state.timelineText}"` : "Timeline not given" });
        else rules.push({ ...base, result: state.timelineMonths <= max ? "PASS" : "FAIL", detail: `Start in ~${fmtMonths(state.timelineMonths)} vs ${max}-month limit` });
        break;
      }
      default:
        rules.push({ ...base, result: "UNKNOWN", detail: `Rule type "${rule.type}" has no evaluator — sending to a human rather than guessing` });
    }
  }

  // confidence: starts high, falls with every source of doubt
  let conf = 0.96;
  conf -= 0.05 * state.hedged.length;
  conf -= 0.12 * state.corrections.length;
  conf -= 0.25 * state.contradictions.length;
  conf -= 0.1 * rules.filter((r) => r.result === "UNKNOWN").length;
  conf = Math.max(0.05, Math.min(0.99, conf));

  const fails = rules.filter((r) => r.result === "FAIL");
  const unknown = rules.filter((r) => r.result === "UNKNOWN" || r.result === "REVIEW");
  let decision: Decision;
  let declineKind: Qualification["declineKind"];

  if (fails.length) {
    decision = "NOT_QUALIFIED";
    declineKind = ({ R1: "service", R2: "location", R3: "size", R4: "budget", R5: "timing" } as const)[fails[0].id as "R1"] ?? undefined;
    // a clear service mismatch is decisive; other fails lose confidence when there's doubt on the call
    if (fails[0].id === "R1") conf = Math.max(conf, 0.9);
    if (highValue && q.highValue.neverAutoReject) { decision = "NEEDS_HUMAN_REVIEW"; reviewReasons.push(`High-value enquiry (${budgetTop ? inr(budgetTop) : ""}${state.area ? ` ${state.area} sq ft` : ""}) would be rejected by ${fails.map((f) => f.id).join(", ")} — Nikhil wants to see these before anyone says no`); }
  } else if (unknown.length || state.contradictions.length) {
    decision = "NEEDS_HUMAN_REVIEW";
  } else {
    decision = "QUALIFIED";
  }

  if (decision === "NEEDS_HUMAN_REVIEW") {
    for (const u of unknown) reviewReasons.push(`${u.id} ${u.name}: ${u.detail}`);
  }
  for (const c of state.contradictions) reviewReasons.push(`Contradiction: ${c}`);
  if (missing.length && decision === "NEEDS_HUMAN_REVIEW") reviewReasons.push(`Missing: ${missing.join(", ")}`);

  const threshold = q.confidenceThreshold;
  if (decision !== "NEEDS_HUMAN_REVIEW" && conf < threshold) {
    reviewReasons.unshift(`AI confidence ${conf.toFixed(2)} is below the ${threshold} threshold (${[state.corrections.length && `${state.corrections.length} correction(s)`, state.hedged.length && `vague: ${state.hedged.join(", ")}`].filter(Boolean).join("; ")})`);
    decision = "NEEDS_HUMAN_REVIEW";
    for (const u of unknown) reviewReasons.push(`${u.id} ${u.name}: ${u.detail}`);
    if (fails.length) reviewReasons.push(...fails.map((f) => `${f.name} would fail: ${f.detail}`));
  }

  const reason =
    decision === "QUALIFIED" ? `Meets all ${rules.filter((r) => r.result === "PASS").length} studio criteria${highValue ? " · high-value" : ""}` :
    decision === "NOT_QUALIFIED" ? fails.map((f) => `${f.name}: ${f.detail}`).join(" · ") :
    reviewReasons[0] ?? "Needs a human decision";

  return { decision, reason, confidence: Number(conf.toFixed(2)), rules, missing, reviewReasons: dedupe(reviewReasons), recommendedAction: nextAction(decision, state, missing, highValue, declineKind), highValue, declineKind };
}

function nextAction(d: Decision, s: CallState, missing: string[], hv: boolean, kind?: string) {
  const who = s.name ? s.name.split(" ")[0] : "the caller";
  if (d === "QUALIFIED") {
    const hook = s.requirements.length ? ` Open with their ${s.requirements.slice(0, 2).join(" and ").toLowerCase()}.` : "";
    return `${hv ? "Nikhil to call" : "Designer to call"} ${who} within 1 hour and book the free consultation — Calendly link is prefilled, book it with them on the call.${hook} Don't re-ask area, budget or timeline — they're on the record.`;
  }
  if (d === "NEEDS_HUMAN_REVIEW") {
    if (missing.length) return `Call ${who} back and confirm ${missing.join(" and ")}${s.contradictions.length ? `; clear up: ${s.contradictions[0]}` : ""}. Then re-run qualification or override.`;
    if (s.contradictions.length) return `Call ${who} and clear up: ${s.contradictions[0]}.`;
    return hv ? `Nikhil to review — high-value enquiry that fails a rule.` : `Review the transcript and decide; record an override with the reason.`;
  }
  if (kind === "timing") return `No designer time now. Send a polite note and add ${who} to a follow-up list for ${s.timelineMonths ? Math.max(1, Math.round(s.timelineMonths - 5)) : 6} months from now.`;
  if (kind === "service") return `No designer action. The caller was told politely that this isn't a service Aangan offers.`;
  return `No designer action. Spot-check this rejection on the Failures page if it looks borderline.`;
}

function labels(ids: string[], kind: "provided" | "excluded") {
  const list = getKB().services.data[kind];
  return ids.map((id) => list.find((e) => e.id === id)?.label ?? id);
}
function dedupe(a: string[]) { return [...new Set(a)]; }
export function fmtMonths(m: number) { return m < 1 ? `${Math.round(m * 4)} weeks` : `${Number(m.toFixed(1))} months`; }
