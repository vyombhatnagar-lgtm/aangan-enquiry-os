import { getKB } from "../knowledge";
import { lakhWords, inr } from "../format";
import type { CallState } from "./extract";

export interface PricingAnswer {
  sufficient: boolean;
  spoken: string; // what the agent says
  record: string; // what goes on the lead record
  rowsUsed: string[];
  escalate?: string; // reason, if a pricing escalation must be logged
}

const QUOTE_REQUEST = /\b(final (quote|price|cost|figure)|exact (price|cost|figure|amount)|fixed (price|quote)|guarantee|guaranteed|discount|best price|lowest price|confirm the price|in writing|binding)\b/i;
export const PRICE_QUESTION = /\b(how much|cost|price|pricing|rate|rates|charges|charge|budget would|estimate|quotation|quote|per square|per sq|expensive|ballpark)\b/i;

export function isQuoteRequest(t: string) { return QUOTE_REQUEST.test(t); }

function roundDown(n: number, step: number) { return Math.floor(n / step) * step; }
function roundUp(n: number, step: number) { return Math.ceil(n / step) * step; }

/**
 * Retrieval-only pricing. Every figure comes from pricing.md. Always a range, always the disclaimer.
 * Never "your project will cost ₹X".
 */
export function indicativePricing(state: CallState, utterance = ""): PricingAnswer {
  const kb = getKB().pricing.data;
  const d = kb.disclaimer;
  const escalate = isQuoteRequest(utterance) ? "Caller asked for a final/exact/guaranteed price" : undefined;
  const prefix = escalate ? "I can't give a final quote — only the design team can do that once they've seen the site. What I can share is indicative. " : "";

  const scope = state.projectScope;
  if (!scope) {
    return { sufficient: false, spoken: `${prefix}It depends a lot on what's being done — a full home, an office or just a kitchen are priced quite differently. Let me understand the project first and I'll give you an indicative range.`, record: "", rowsUsed: [], escalate };
  }
  if (scope === "kitchen_wardrobe") {
    const p = kb.packages.find((x) => x.scope === "kitchen_wardrobe");
    if (!p) return { sufficient: false, spoken: `${prefix}I don't have an approved figure for that, so I'll have the design team come back to you on pricing.`, record: "", rowsUsed: [], escalate: escalate ?? "No pricing row for scope" };
    const s = `Indicatively, a standalone modular kitchen with us is usually in the range of ${lakhWords(p.min)} to ${lakhWords(p.max)}. ${d}`;
    return { sufficient: true, spoken: prefix + s, record: `${p.label}: ${inr(p.min)} – ${inr(p.max)} (indicative). ${d}`, rowsUsed: [p.id], escalate };
  }
  const tiers = kb.defaultTierForBroadRange[scope];
  const rows = tiers ? kb.perSqft.filter((r) => tiers.includes(r.id)) : kb.perSqft.filter((r) => r.scope === scope);
  if (!rows.length) return { sufficient: false, spoken: `${prefix}I don't have an approved figure for that kind of work, so the design team will come back to you on pricing.`, record: "", rowsUsed: [], escalate: escalate ?? `No pricing row for scope ${scope}` };
  const min = Math.min(...rows.map((r) => r.min));
  const max = Math.max(...rows.map((r) => r.max));
  const tierNames = rows.map((r) => r.tier).join(" to ");

  if (!state.area) {
    const s = `Indicatively, ${scope === "office" ? "office interiors" : scope === "full_home" ? "full home interiors" : "this kind of work"} with us usually fall between ₹${min.toLocaleString("en-IN")} and ₹${max.toLocaleString("en-IN")} per square foot of carpet area, depending on finishes. I'd need the area to give you a total range. ${d}`;
    return { sufficient: false, spoken: prefix + s, record: `${inr(min)}–${inr(max)} per sq ft (${tierNames}, indicative; no total given — area unknown). ${d}`, rowsUsed: rows.map((r) => r.id), escalate };
  }
  const step = kb.roundTotalsTo || 50000;
  const lo = roundDown(state.area * min, step);
  const hi = roundUp(state.area * max, step);
  const s = `Based on what you've shared — about ${state.area.toLocaleString("en-IN")} square feet — the indicative range is roughly ₹${min.toLocaleString("en-IN")} to ₹${max.toLocaleString("en-IN")} per square foot, so somewhere around ${lakhWords(lo)} to ${lakhWords(hi)} overall. ${d}`;
  return {
    sufficient: true,
    spoken: prefix + s,
    record: `${inr(min)}–${inr(max)}/sq ft × ${state.area} sq ft ≈ ${inr(lo)} – ${inr(hi)} (${tierNames}, indicative only). ${d}`,
    rowsUsed: rows.map((r) => r.id),
    escalate,
  };
}

/** Guardrail: every rupee figure the agent speaks must be traceable to pricing.md or services.md. */
export function allowedAmounts(state: CallState): Set<number> {
  const kb = getKB().pricing.data;
  const set = new Set<number>([2500]);
  for (const r of kb.perSqft) { set.add(r.min); set.add(r.max); }
  for (const p of kb.packages) { set.add(p.min); set.add(p.max); }
  if (state.area) {
    const step = kb.roundTotalsTo || 50000;
    for (const r of kb.perSqft) { set.add(roundDown(state.area * r.min, step)); set.add(roundUp(state.area * r.max, step)); }
  }
  if (state.budgetMin) set.add(state.budgetMin);
  if (state.budgetMax) set.add(state.budgetMax);
  return set;
}

/** Returns offending amounts in text that aren't in the allowed set (rupees). */
export function unapprovedAmounts(text: string, state: CallState): string[] {
  const allowed = allowedAmounts(state);
  const bad: string[] = [];
  const re = /(?:₹|rs\.?\s?|inr\s?)\s?(\d[\d,]*(?:\.\d+)?)\s*(lakh|lac|crore|cr|k)?|(\d+(?:\.\d+)?)\s*(lakh|lac|crore)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = m[1] ?? m[3];
    const unit = (m[2] ?? m[4] ?? "").toLowerCase();
    let v = Number(raw.replace(/,/g, ""));
    if (unit.startsWith("lakh") || unit.startsWith("lac")) v *= 1e5;
    else if (unit.startsWith("cr")) v *= 1e7;
    else if (unit === "k") v *= 1e3;
    const ok = [...allowed].some((a) => Math.abs(a - v) <= Math.max(1, a * 0.02));
    if (!ok) bad.push(m[0]);
  }
  if (/\b(will cost|it costs exactly|final price is|guaranteed price|fixed price of)\b/i.test(text)) bad.push("definitive-price phrasing");
  return bad;
}
