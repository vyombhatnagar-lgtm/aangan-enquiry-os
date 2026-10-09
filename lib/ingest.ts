import { extractStep, startAgent } from "./engine/conversation";
import { qualify } from "./engine/qualify";
import { unapprovedAmounts } from "./engine/pricing";
import { parseArea, parseBhk, parseBudget, parseLocation, parseTimeline, scopeLabel, matchServices } from "./engine/extract";
import { completeCall, newId, type TimedEvent } from "./pipeline";
import { isAfterHours } from "./format";
import type { Slot, Turn } from "./types";

/**
 * Shared ingestion for transcripts produced by an external voice platform (Vaani, Exotel, Vapi…).
 * The platform held the conversation; THIS app makes the decision: same extractor, same qualified.md rules,
 * same pricing guardrail (applied after the fact as an audit), same handoff.
 */
const SLOT_HINTS: [RegExp, Slot][] = [[/\bname\b/i, "name"], [/where|location|located|which area/i, "location"], [/area|square feet|sq\.? ?ft|carpet/i, "area"], [/when|start|possession/i, "timeline"], [/budget/i, "budget"], [/project|home|office|kitchen/i, "project"]];

export interface IngestTurn { speaker: "agent" | "caller"; text: string; at: number }

export async function ingestTranscript(args: {
  phone: string; startedAt: Date; turns: IngestTurn[]; entities?: Record<string, unknown>; summary?: string;
  engine: string; callId?: string; durationSec?: number; appUrl?: string; extraEvents?: TimedEvent[];
}) {
  const at = args.startedAt;
  const { state } = startAgent(isAfterHours(at));
  const transcript: Turn[] = [];
  const events: TimedEvent[] = [...(args.extraEvents ?? [])];
  let lastAgent = "", lastCaller = "";
  for (const t of args.turns) {
    transcript.push({ speaker: t.speaker, text: t.text, at: t.at });
    if (t.speaker === "caller") {
      lastCaller = t.text;
      state.lastAsked = SLOT_HINTS.find(([re]) => re.test(lastAgent))?.[1];
      const { changed, correction } = extractStep(state, t.text, at);
      if (Object.keys(changed).length) events.push({ type: "EXTRACTED", message: Object.keys(changed).join(","), offset: t.at });
      if (correction) events.push({ type: "CUSTOMER_CORRECTION", severity: "warn", message: `Caller corrected ${correction.slot}: "${correction.from}" → "${correction.to}"`, offset: t.at, data: correction });
    } else {
      lastAgent = t.text;
      // guardrail audit: the platform's agent spoke live, so we check what it said afterwards
      const bad = unapprovedAmounts(t.text, state.cs);
      if (bad.length) events.push({ type: "PRICING_GUARDRAIL_BREACH", severity: "error", message: `Agent said figures not in pricing.md: ${bad.join(", ")}`, offset: t.at, data: { text: t.text } });
      if (/\b(per (square|sq)|lakh|crore|₹)/i.test(t.text) && /indicative|varies|approximately|roughly|range/i.test(t.text)) {
        state.cs.pricingGiven = true;
        state.cs.pricingText = state.cs.pricingText ?? `Agent said: "${t.text.slice(0, 220)}"`;
        events.push({ type: "PRICING_SHOWN", message: "Indicative pricing discussed (voice platform)", offset: t.at });
        if (!/varies|depend|confirm/i.test(t.text)) events.push({ type: "PRICING_GUARDRAIL_BREACH", severity: "error", message: "Price given without the 'varies by site' caveat", offset: t.at });
      }
      if (/\b(final (quote|price)|exact (price|cost)|guarantee)/i.test(lastCaller)) events.push({ type: "PRICING_ESCALATION", severity: "warn", message: "Final/exact price discussed — design team must quote", offset: t.at });
    }
  }
  if (args.entities) fillFromEntities(state.cs, args.entities, at, events);
  state.qualification = qualify(state.cs);
  state.done = true;
  const end = transcript.at(-1)?.at ?? 0;
  events.push({ type: "QUALIFICATION", message: `${state.qualification.decision} (confidence ${state.qualification.confidence})`, offset: end, data: { decision: state.qualification.decision } });
  const answerSec = transcript.find((t) => t.speaker === "agent")?.at ?? 0;
  return completeCall({
    state, transcript, events, phone: args.phone, startedAt: at, callId: args.callId ?? newId("CALL", at), engine: args.engine,
    isDemo: false, responseTimeSeconds: answerSec, deliverHandoff: true, appUrl: args.appUrl, summary: args.summary,
  });
}

/** Vaani "data collection" entities fill only what the transcript extractor missed — and pass through the same parsers. */
function fillFromEntities(cs: ReturnType<typeof startAgent>["state"]["cs"], e: Record<string, unknown>, now: Date, events: TimedEvent[]) {
  const v = (k: string) => { const x = e[k]; if (x == null) return undefined; const s = String(x).trim(); return !s || /^(n\/?a|null|none|unknown|not mentioned|-)$/i.test(s) ? undefined : s; };
  const filled: string[] = [];
  const name = v("customer_name"); if (!cs.name && name) { cs.name = name; filled.push("name"); }
  const work = [v("project_type"), v("services_requested")].filter(Boolean).join(" ");
  if (work) {
    const m = matchServices(work);
    for (const id of m.provided) if (!cs.servicesRequested.includes(id)) cs.servicesRequested.push(id);
    for (const id of m.excluded) if (!cs.servicesExcluded.includes(id)) cs.servicesExcluded.push(id);
    if (!cs.projectScope && m.provided.length && !m.excluded.length) { cs.projectScope = ["office", "design_only", "renovation", "full_home", "kitchen_wardrobe"].find((o) => m.provided.includes(o)) ?? m.provided[0]; cs.projectType = scopeLabel(cs.projectScope); filled.push("project"); }
  }
  const bhk = v("bhk"); if (!cs.bhk && bhk) { const b = parseBhk(`${bhk} bhk`) ?? Number(bhk); if (b) { cs.bhk = b; filled.push("bhk"); if (!cs.projectScope) { cs.projectScope = "full_home"; cs.projectType = scopeLabel("full_home"); } } }
  const loc = v("location"); if (!cs.location && loc) { const l = parseLocation(loc, "location"); cs.location = l?.location ?? loc; cs.inServiceArea = l?.inServiceArea ?? null; filled.push("location"); }
  const area = v("carpet_area_sqft"); if (!cs.area && area) { const a = parseArea(area, "area"); if (a) { cs.area = a; filled.push("area"); } }
  const budget = v("budget"); if (cs.budgetMax == null && cs.budgetMin == null && budget) { const b = parseBudget(budget, "budget"); if (b && !b.unsure) { cs.budgetMin = b.min; cs.budgetMax = b.max; cs.budgetText = budget; filled.push("budget"); } }
  const tl = v("timeline"); if (cs.timelineMonths == null && tl) { const t = parseTimeline(tl, now, "timeline"); if (t && !t.unsure) { cs.timelineMonths = t.months; cs.timelineText = tl; filled.push("timeline"); } }
  const req = v("requirements"); if (req) for (const r of req.split(/[,;]/).map((s) => s.trim()).filter(Boolean)) if (!cs.requirements.includes(r)) cs.requirements.push(r);
  if (filled.length) { cs.unclear = cs.unclear.filter((u) => !filled.includes(u)); events.push({ type: "AI_EXTRACTION", message: `Vaani data collection filled: ${filled.join(", ")}`, offset: 0 }); }
}
