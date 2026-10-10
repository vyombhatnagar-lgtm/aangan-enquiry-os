import { generateObject } from "ai";
import { z } from "zod";
import type { Lead, Turn } from "../types";
import type { CallAnalysis, CallClass, ImprovementArea, ObjectionDetail, PhoenixProtocol, Swot } from "./types";
import { conversationSignals, opportunityScore } from "./signals";
import { llmAvailable } from "../engine/llm";

export const INTEL_MODEL = process.env.INTEL_MODEL || "google/gemini-2.5-flash";

/* ───────────── Stage 5 — Classification gate ───────────── */
const EXISTING = /\b(my (ongoing )?project with you|our project with aangan|site supervisor|already (working|signed) with (you|aangan)|handover|installation (is|was)|snag|complaint|payment (for|of) (the )?(invoice|milestone)|your team (came|didn'?t))\b/i;
const VENDOR = /\b(i (supply|sell|manufacture)|we (supply|manufacture)|supplier|vendor|dealer|looking for (a )?job|resume|internship|hiring|marketing services|seo services|collaborat(e|ion) proposal)\b/i;

export function classifyCall(transcript: Turn[]): { callClass: CallClass; reason: string } {
  const first = transcript.filter((t) => t.speaker === "caller").slice(0, 3).map((t) => t.text).join(" ");
  if (EXISTING.test(first)) return { callClass: "EXISTING_CLIENT", reason: `Caller refers to an existing Aangan project: "${first.match(EXISTING)![0]}"` };
  if (VENDOR.test(first)) return { callClass: "VENDOR_OR_OTHER", reason: `Not a project enquiry: "${first.match(VENDOR)![0]}"` };
  return { callClass: "ENQUIRY", reason: "Caller is asking about a new interior project" };
}

/* ───────────── Heuristic analysis (deterministic fallback) ───────────── */
const OBJ: { type: ObjectionDetail["type"]; re: RegExp; ideal: string }[] = [
  { type: "price", re: /\b(expensive|costly|too much|over (my )?budget|cheaper|discount|final (price|quote)|exact (price|cost|figure)|guarantee)/i, ideal: "Acknowledge the worry, give the indicative per-sq-ft band for their area, explain Essential vs Signature finishes, and offer the free consultation as the route to a real number." },
  { type: "delay", re: /\b(later|not now|next year|after (my|the) (exams|loan|wedding)|depends on (the )?(loan|possession)|exams|no rush|just exploring)\b/i, ideal: "Agree timing matters, then show why planning now helps: design and 3D take 4–6 weeks, so a consultation 6–8 weeks before possession means work starts the week they get keys." },
  { type: "trust", re: /\b(reviews?|past work|portfolio|reliable|trust|cheated|bad experience|previous designer)\b/i, ideal: "Offer two or three completed homes in their locality, a walkthrough at the studio, and note the site-visit fee is adjusted against design fees." },
  { type: "competition", re: /\b(other (designer|firm|studio)s?|another (designer|firm|studio)|quotation from|comparing|livspace|homelane|design ?cafe|interior company)\b/i, ideal: "Ask what they liked in the other quote, then position Aangan's 3D-first process and transparent material spec. Don't discount on the phone." },
  { type: "confusion", re: /\b(not sure|no idea|don'?t know|confused|which one|maybe the full thing|maybe just)\b/i, ideal: "Summarise what you heard, then confirm one number at a time (area, budget, start month) instead of asking open questions." },
];

function nextAgent(transcript: Turn[], i: number) {
  for (let j = i + 1; j < transcript.length; j++) if (transcript[j].speaker === "agent") return transcript[j].text;
  return "";
}

function heuristic(lead: Lead, transcript: Turn[], callClass: CallClass, classReason: string): Omit<CallAnalysis, "engine" | "analysedAt" | "attempts"> {
  const s = conversationSignals(transcript);
  const objections: ObjectionDetail[] = [];
  transcript.forEach((t, i) => {
    if (t.speaker !== "caller") return;
    for (const o of OBJ) {
      if (!o.re.test(t.text) || objections.some((x) => x.type === o.type)) continue;
      const ans = nextAgent(transcript, i);
      const resolved = o.type === "price" ? /indicative|per square|range/i.test(ans) : o.type === "confusion" ? false : /consultation|design team|call you/i.test(ans);
      const strength: ObjectionDetail["strength"] = o.type === "price" && /final|exact|guarantee/i.test(t.text) ? "strong" : o.type === "delay" && (lead.timelineMonths ?? 0) > 6 ? "critical" : "moderate";
      objections.push({ type: o.type, strength, resolved, customerQuote: t.text.slice(0, 180), agentResponse: ans.slice(0, 220) || "(no response)", idealResponse: o.ideal });
    }
  });
  if (lead.servicesExcluded.length) objections.push({ type: "scope", strength: "critical", resolved: true, customerQuote: transcript.find((t) => t.speaker === "caller")?.text.slice(0, 180) ?? "", agentResponse: "Told politely that this isn't a service Aangan offers.", idealResponse: "Be clear it isn't offered, and if possible name the kind of firm that does it so the caller leaves helped." });

  const fails = lead.ruleTrace.filter((r) => r.result === "FAIL");
  const swot: Swot = { strengths: [], weaknesses: [], opportunities: [], threats: [] };
  if (lead.timelineMonths != null && lead.timelineMonths <= 2) swot.strengths.push(`Ready soon: "${lead.timeline}"`);
  if (lead.ruleTrace.find((r) => r.id === "R4" && r.result === "PASS")) swot.strengths.push(`Budget ${lead.budget} fits the Essential range for ${lead.approximateArea} sq ft`);
  if (lead.inServiceArea) swot.strengths.push(`In the service area (${lead.location})`);
  if (lead.highValue) swot.strengths.push("High-value project");
  if (lead.missingFields.length) swot.weaknesses.push(`Missing: ${lead.missingFields.join(", ")}`);
  if (s.hesitations) swot.weaknesses.push(`${s.hesitations} hesitant answer(s) ("not sure", "maybe")`);
  if (!lead.customerName) swot.weaknesses.push("Name not captured");
  const upsell = ["False ceiling", "Lighting design", "Wardrobes", "Modular kitchen", "Home automation"].filter((r) => !lead.requirements.includes(r));
  if (lead.decision === "QUALIFIED" && lead.requirements.length) swot.opportunities.push(`Asked for ${lead.requirements.slice(0, 3).join(", ").toLowerCase()}; also discuss ${upsell.slice(0, 2).join(" and ").toLowerCase()}`);
  if (lead.afterHours) swot.opportunities.push("After-hours caller — a fast morning callback is the edge over studios that let it wait");
  if (lead.indicativePricingShown) swot.opportunities.push("Already heard an indicative range; the consultation can go straight to tiers and finishes");
  for (const f of fails) swot.threats.push(`${f.name}: ${f.detail}`);
  if (objections.some((o) => o.type === "competition")) swot.threats.push("Comparing with other studios");

  const qualified = lead.decision === "QUALIFIED";
  const buyerSignals: CallAnalysis["buyerSignals"] =
    lead.decision === "NOT_QUALIFIED" || s.hesitations >= 3 ? "low" :
    qualified && (lead.timelineMonths ?? 9) <= 2 && (lead.budgetMax ?? 0) > 0 && (s.priceMentions > 0 || s.callerQuestions > 0) ? "high" : "medium";
  const dealOutcome: CallAnalysis["dealOutcome"] =
    callClass !== "ENQUIRY" ? "uncertain" : lead.projectOutcome === "WON" ? "likely_closed" : lead.projectOutcome === "LOST" || lead.decision === "NOT_QUALIFIED" ? "likely_lost" : qualified ? "follow_up_needed" : "uncertain";
  let p = lead.projectOutcome === "WON" ? 1 : lead.projectOutcome === "LOST" ? 0.02 : lead.decision === "NOT_QUALIFIED" ? 0.05 : qualified ? 0.3 : 0.12;
  if (lead.projectOutcome === "PENDING") {
    if (lead.consultationStatus === "COMPLETED") p += 0.25; else if (lead.consultationStatus === "SCHEDULED") p += 0.15;
    if (buyerSignals === "high") p += 0.1; if (objections.some((o) => !o.resolved)) p -= 0.08;
  }
  p = Math.max(0.01, Math.min(1, p));

  const lostOpportunityReason =
    fails[0] ? `${fails[0].name}: ${fails[0].detail}` :
    objections.find((o) => !o.resolved) ? `Unresolved ${objections.find((o) => !o.resolved)!.type} objection` :
    lead.missingFields.length ? `Couldn't confirm ${lead.missingFields.join(", ")}` :
    lead.designerContactedAt ? "No clear risk — depends on the consultation" : "Risk is speed: not yet contacted by a designer";

  const areas: ImprovementArea[] = [];
  const priceTurn = transcript.findIndex((t) => t.speaker === "caller" && /how much|cost|price/i.test(t.text));
  if (priceTurn >= 0 && !/indicative|per square/i.test(nextAgent(transcript, priceTurn))) areas.push({ skill: "Price handling", observed: "Caller asked the price and the agent deferred without giving a per-sq-ft band.", fix: "Give the per-sq-ft range from pricing.md immediately, then ask for the area to narrow it." });
  if (s.hesitations >= 2) areas.push({ skill: "Probing", observed: `${s.hesitations} vague answers were accepted as-is.`, fix: "Offer a bracket instead of an open question: 'Is it closer to 10 lakh or 20 lakh?'" });
  if (!lead.customerName) areas.push({ skill: "Identification", observed: "Call ended without the caller's name.", fix: "Ask for the name right after the project question." });
  if (transcript.some((t) => t.meta?.event?.includes("CUSTOMER_CORRECTION"))) areas.push({ skill: "Read-back", observed: "The caller corrected a number mid-call.", fix: "Read back area and budget once before closing the call." });
  if (!areas.length) areas.push({ skill: "Closing", observed: "Call covered every field cleanly.", fix: "Offer two specific consultation slots in the close so the callback starts from a booking, not a question." });

  const coaching: string[] = [];
  if (qualified) coaching.push(`Designer: open the callback with ${lead.requirements[0]?.toLowerCase() ?? "their timeline"} and don't re-ask area, budget or timeline.`);
  if (objections.some((o) => o.type === "price")) coaching.push("Role-play the price question: indicative band → tiers → consultation, in under 30 seconds.");
  if (objections.some((o) => o.type === "delay")) coaching.push("Build a 'plan before possession' one-pager the designer can WhatsApp after the call (manual, not automated).");
  if (!coaching.length) coaching.push("No coaching needed on this call. Use it as a reference transcript.");

  let phoenix: PhoenixProtocol | null = null;
  if (callClass === "ENQUIRY" && (lead.decision !== "QUALIFIED" || lead.projectOutcome === "LOST")) {
    const first = lead.customerName?.split(" ")[0] ?? "there";
    const timing = fails.find((f) => f.id === "R5");
    const budget = fails.find((f) => f.id === "R4");
    const scope = fails.find((f) => f.id === "R1");
    const location = fails.find((f) => f.id === "R2");
    if (scope || location) {
      phoenix = { verdict: lead.highValue ? "HIGH_PRIORITY_RECOVERY" : "DEAD_LEAD", stallRootCause: (scope ?? location)!.detail, recoveryProbability: lead.highValue ? 4 : 1, hearYouHook: `${first}, thanks again for thinking of Aangan.`, commercialInsight: scope ? "This work sits outside what the studio does." : "The studio works within Pune.", mustSayScript: "We'd rather point you to the right people than take on work we can't do well.", waitDays: 0, decisionMakerBridge: "—" };
    } else if (timing) {
      const wait = Math.max(14, Math.round(((lead.timelineMonths ?? 9) - 5) * 30));
      phoenix = { verdict: "NURTURE", stallRootCause: `Start is ~${Math.round(lead.timelineMonths ?? 0)} months away`, recoveryProbability: 6, hearYouHook: `${first}, when we spoke you said you were looking at starting "${lead.timeline}".`, commercialInsight: "Design and 3D take 4–6 weeks, so starting the design a couple of months before possession means work begins the week you get the keys.", mustSayScript: "Shall we pencil in a free consultation about eight weeks before your possession date?", waitDays: wait, decisionMakerBridge: "Is anyone else in the family deciding on the interiors? We can set the consultation for when you're both free." };
    } else if (budget) {
      phoenix = { verdict: "NURTURE", stallRootCause: budget.detail, recoveryProbability: 3, hearYouHook: `${first}, I know the range I mentioned felt high.`, commercialInsight: "Many clients phase the work: kitchen and wardrobes first, living room later, inside the same design.", mustSayScript: "Would a phased plan inside your budget be worth a free 45-minute consultation?", waitDays: 30, decisionMakerBridge: "If someone else is funding part of it, we can include them on a video call." };
    } else if (lead.projectOutcome === "LOST") {
      phoenix = { verdict: "NURTURE", stallRootCause: lead.qualificationReason ?? "Lost after consultation", recoveryProbability: 3, hearYouHook: `${first}, hope the home is coming along.`, commercialInsight: "If any room is still pending, we can take that on as its own project.", mustSayScript: "Is there a part of the house you haven't started yet?", waitDays: 60, decisionMakerBridge: "—" };
    } else {
      phoenix = { verdict: lead.highValue ? "HIGH_PRIORITY_RECOVERY" : "NURTURE", stallRootCause: lead.reviewReasons[0] ?? "Information incomplete", recoveryProbability: lead.highValue ? 7 : 5, hearYouHook: `${first}, you'd called about interiors${lead.location ? ` for ${lead.location}` : ""}.`, commercialInsight: "Two quick details let the design team give you a proper indicative range.", mustSayScript: `Could you confirm ${lead.missingFields.slice(0, 2).join(" and ") || "the carpet area and budget"}?`, waitDays: 1, decisionMakerBridge: "Happy to call back when the decision-maker is around." };
    }
  }

  const summary = lead.conversationSummary ?? "";
  const base = { callClass, classReason, objections, swot, dealOutcome, dealProbability: Number(p.toFixed(2)), buyerSignals, lostOpportunityReason, agentImprovementAreas: areas.slice(0, 4), coachingRecommendations: coaching.slice(0, 4), callSummary: summary, phoenix, signals: s, opportunityScore: 0 };
  base.opportunityScore = opportunityScore(buyerSignals, s);
  return base;
}

/* ───────────── LLM analysis (Gemini via AI Gateway, structured output) ───────────── */
const Schema = z.object({
  objections: z.array(z.object({ type: z.enum(["price", "trust", "delay", "confusion", "competition", "scope"]), strength: z.enum(["weak", "moderate", "strong", "critical"]), resolved: z.boolean(), customerQuote: z.string(), agentResponse: z.string(), idealResponse: z.string() })).max(6),
  swot: z.object({ strengths: z.array(z.string()).max(4), weaknesses: z.array(z.string()).max(4), opportunities: z.array(z.string()).max(4), threats: z.array(z.string()).max(4) }),
  buyerSignals: z.enum(["high", "medium", "low"]),
  lostOpportunityReason: z.string(),
  agentImprovementAreas: z.array(z.object({ skill: z.string(), observed: z.string(), fix: z.string() })).min(1).max(4),
  coachingRecommendations: z.array(z.string()).min(1).max(4),
  callSummary: z.string(),
});

/** Retries with exponential backoff + jitter (thundering-herd safe when many workers hit the quota together). */
export async function withRetry<T>(fn: () => Promise<T>, tries = 3, base = 1500): Promise<{ value: T; attempts: number }> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return { value: await fn(), attempts: i + 1 }; } catch (e) {
      last = e;
      const msg = String((e as Error)?.message ?? e);
      if (!/429|rate|quota|timeout|ECONNRESET|5\d\d/i.test(msg) || i === tries - 1) break;
      await new Promise((r) => setTimeout(r, base * 2 ** i + Math.random() * base));
    }
  }
  throw last;
}

export async function analyzeCall(lead: Lead, transcript: Turn[], opts: { useLLM?: boolean } = {}): Promise<CallAnalysis> {
  const { callClass, reason } = classifyCall(transcript);
  const h = heuristic(lead, transcript, callClass, reason);
  const now = new Date().toISOString();
  if (!opts.useLLM || !llmAvailable() || callClass !== "ENQUIRY" || transcript.filter((t) => t.speaker === "caller").length < 2) {
    return { ...h, engine: "heuristic", analysedAt: now, attempts: 1 };
  }
  try {
    const { value, attempts } = await withRetry(() => generateObject({
      model: INTEL_MODEL,
      schema: Schema,
      abortSignal: AbortSignal.timeout(20000),
      system: "You analyse inbound phone enquiries for Aangan Studio, an interior design studio in Pune (homes and small offices). Ground every point in the transcript — quote the caller verbatim for objections. Ideal responses must never promise a final price or a service the studio doesn't offer. Agent improvement areas are about the AI phone agent's behaviour. Coaching recommendations are actions for the design team or prompt changes. Be specific, never generic.",
      prompt: `Qualification result (from explicit rules, not yours to change): ${lead.decision} — ${lead.qualificationReason}\nKnown fields: ${JSON.stringify({ name: lead.customerName, project: lead.projectType, bhk: lead.bhk, location: lead.location, area: lead.approximateArea, budget: lead.budget, timeline: lead.timeline, requirements: lead.requirements })}\n\nTranscript:\n${transcript.map((t) => `${t.speaker === "agent" ? "Agent" : t.speaker === "caller" ? "Customer" : "System"}: ${t.text}`).join("\n")}`,
    }));
    const o = value.object;
    const merged: CallAnalysis = {
      ...h,
      objections: o.objections.length ? o.objections : h.objections,
      swot: o.swot,
      buyerSignals: o.buyerSignals,
      lostOpportunityReason: o.lostOpportunityReason,
      agentImprovementAreas: o.agentImprovementAreas,
      coachingRecommendations: o.coachingRecommendations,
      callSummary: o.callSummary || h.callSummary,
      engine: INTEL_MODEL, analysedAt: now, attempts,
    };
    merged.opportunityScore = opportunityScore(merged.buyerSignals, merged.signals);
    return merged;
  } catch (e) {
    console.warn("analyzeCall LLM failed, heuristic used:", (e as Error).message);
    return { ...h, engine: `heuristic (AI failed: ${String((e as Error).message).slice(0, 80)})`, analysedAt: now, attempts: 3 };
  }
}
