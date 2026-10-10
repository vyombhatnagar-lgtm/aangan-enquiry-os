import { getKB } from "../knowledge";
import { emptyState, extractInto, slotFilled, scopeLabel, type CallState } from "./extract";
import { indicativePricing, isQuoteRequest, PRICE_QUESTION } from "./pricing";
import { qualify, fmtMonths, type Qualification } from "./qualify";
import type { Slot } from "../types";

export interface AgentEvent { type: string; message: string; severity?: "info" | "warn" | "error"; data?: Record<string, unknown> }
export interface AgentState {
  cs: CallState;
  lastAsked?: Slot;
  turns: number;
  done: boolean;
  afterHours: boolean;
  qualification?: Qualification;
}
export interface AgentReply { text: string; asked?: Slot; done: boolean; events: AgentEvent[]; kb: string[]; pricing?: boolean }

export const OPENING = "Hi, you've reached Aangan Studio. I'm the studio's assistant — I can help understand your project and get the right information across to our design team.";

const ORDER: Slot[] = ["project", "name", "location", "area", "timeline", "budget"];
const MAX_TURNS = 14;

const QUESTIONS: Record<Slot, (s: CallState) => string> = {
  project: () => "What's the project — a home, an office, or something specific like a kitchen?",
  name: () => "May I have your name?",
  location: (s) => (s.propertyType === "Office" ? "Where is the office?" : "Where is the property?"),
  area: (s) => (s.bhk ? `Do you know the carpet area of the ${s.bhk} BHK, roughly in square feet?` : "Roughly what's the carpet area, in square feet?"),
  services: () => "Which parts would you like us to handle?",
  timeline: (s) => (s.propertyType === "Office" ? "When would you like the work to start?" : "When are you hoping to start — do you have possession already?"),
  budget: () => "And have you set aside a budget range for the interiors? A rough range is fine.",
};

export function startAgent(afterHours: boolean): { state: AgentState; reply: AgentReply } {
  const state: AgentState = { cs: emptyState(), turns: 0, done: false, afterHours };
  return { state, reply: { text: OPENING + " How can I help?", done: false, events: [{ type: "AI_ANSWERED", message: "AI answered the call" }], kb: [] } };
}

function nextSlot(s: AgentState): Slot | undefined {
  const cs = s.cs;
  for (const slot of ORDER) {
    if (slot === "area" && cs.projectScope === "kitchen_wardrobe") continue;
    if (slotFilled(cs, slot)) continue;
    if (cs.asked.includes(slot)) continue; // never ask the same question twice
    return slot;
  }
  return undefined;
}

function ack(changed: Record<string, unknown>, cs: CallState, turn: number): string {
  const bits: string[] = [];
  if (changed.name) bits.push(`Thanks, ${String(changed.name).split(" ")[0]}.`);
  const proj = changed.projectScope || changed.bhk || changed.propertyType;
  if (proj && cs.projectScope) {
    const what = cs.bhk ? `a ${cs.bhk} BHK${cs.propertyType && cs.propertyType !== "Apartment" ? ` ${cs.propertyType.toLowerCase()}` : ""}` : cs.propertyType ? `the ${cs.propertyType.toLowerCase()}` : "";
    bits.push(cs.projectScope === "full_home" ? `Got it — full home interiors${what ? ` for ${what}` : ""}.` : `Got it — ${scopeLabel(cs.projectScope).toLowerCase()}.`);
  }
  if (changed.location && !changed.projectScope) bits.push(cs.inServiceArea ? `${cs.location?.replace(", Pune", "")} — good.` : `Noted, ${cs.location}.`);
  if (changed.area) bits.push(`About ${Number(changed.area).toLocaleString("en-IN")} square feet, noted.`);
  if (changed.timeline && cs.timelineMonths != null) bits.push(cs.timelineMonths <= 1 ? "So fairly soon." : `So roughly ${fmtMonths(cs.timelineMonths)} out.`);
  if (changed.budget && !bits.length) bits.push(["Thank you, that helps.", "Okay, noted.", "That's useful, thank you."][turn % 3]);
  if (!bits.length) return ["Okay.", "Sure.", "Understood."][turn % 3];
  return bits.join(" ");
}

function answerServiceQuestion(t: string, cs: CallState): { text?: string; kb?: string } {
  if (!/\b(do you|can you|you guys|does aangan|will you)\b.*\b(do|handle|provide|offer|take|work on|make)\b/i.test(t)) return {};
  const kb = getKB().services.data;
  const s = t.toLowerCase();
  const ex = kb.excluded.find((e) => e.keywords.some((k) => s.includes(k)));
  if (ex) return { text: `That's not something Aangan does — ${ex.label.toLowerCase()} isn't in our services.`, kb: `services.md › We do not provide › ${ex.label}` };
  const pr = kb.provided.find((e) => e.keywords.some((k) => s.includes(k)));
  if (pr) return { text: `Yes, that's something we do — ${pr.label.toLowerCase()}.`, kb: `services.md › We provide › ${pr.label}` };
  void cs;
  return { text: "I'm not certain that's something we offer, so I won't guess — I'll note it for the design team to confirm.", kb: "services.md (no match → escalate)" };
}

function answerFaq(t: string): { text?: string; kb?: string; id?: string } {
  const s = t.toLowerCase();
  for (const f of getKB().services.data.faq) if (f.keywords.some((k) => s.includes(k))) return { text: f.answer, kb: `services.md › Permitted answers › ${f.id}`, id: f.id };
  return {};
}

export function agentTurn(state: AgentState, utterance: string, now: Date): AgentReply {
  const { changed, correction } = extractStep(state, utterance, now);
  return respondStep(state, utterance, changed, correction);
}

export function extractStep(state: AgentState, utterance: string, now: Date) {
  return extractInto(state.cs, utterance, state.lastAsked, now);
}

export function respondStep(state: AgentState, utterance: string, changed: Record<string, unknown>, correction: { slot: string; from: string; to: string } | undefined): AgentReply {
  const now = new Date();
  const cs = state.cs;
  state.turns++;
  const events: AgentEvent[] = [];
  const kb: string[] = [];
  const hint = state.lastAsked;
  if (Object.keys(changed).length) events.push({ type: "EXTRACTED", message: `Captured ${Object.keys(changed).join(", ")}`, data: changed });
  if (correction) events.push({ type: "CUSTOMER_CORRECTION", severity: "warn", message: `Caller corrected ${correction.slot}: "${correction.from}" → "${correction.to}"`, data: correction });

  const parts: string[] = [];
  let pricingSpoken = false;
  const t = utterance;

  // classification gate, live: existing clients and vendors are routed to the studio, not qualified
  if (state.turns === 1 && /\b(my (ongoing )?project with you|our project with aangan|site supervisor|already (working|signed) with (you|aangan)|handover|snag|complaint|i (supply|sell|manufacture)|we (supply|manufacture)|supplier|vendor|dealer|looking for (a )?job|resume|internship)\b/i.test(t)) {
    cs.declined = true;
    events.push({ type: "NON_ENQUIRY", message: "Existing client or vendor call — routed to the studio team" });
    parts.push("Thanks for letting me know. This line is for new project enquiries, so I'll pass your message straight to the studio team and someone will call you back during studio hours, 10 to 7.");
    state.lastAsked = undefined;
    return finish(state, parts, events, kb, now, false);
  }

  // all requested work is out of scope → polite decline, no qualification theatre
  if (!cs.declined && cs.servicesExcluded.length && !cs.servicesRequested.length && !cs.projectScope) {
    cs.declined = true;
    const label = getKB().services.data.excluded.find((e) => e.id === cs.servicesExcluded[0])?.label ?? "that";
    kb.push(`services.md › We do not provide › ${label}`);
    events.push({ type: "SERVICE_FIT", message: `Service not provided: ${label}`, data: { excluded: cs.servicesExcluded } });
    parts.push(`I'm sorry, that's not something Aangan takes on: ${label.toLowerCase()} is outside our services. The studio does home interiors and small offices up to 5,000 square feet, so I don't want to set up a consultation that wastes your time.`);
    state.lastAsked = undefined;
    return finish(state, parts, events, kb, now, false);
  }

  if (/\b(speak|talk) (to|with) (a |the |someone|somebody|designer|person|human|real)/i.test(t) || /\bdesigner (call|speak)/i.test(t)) {
    cs.wantsHuman = true;
    events.push({ type: "HUMAN_REQUESTED", message: "Caller asked to speak to a person", severity: "info" });
    parts.push("The designers aren't on this line, but I'll make sure one of them calls you back — and I'll pass on everything you tell me so you don't have to repeat it.");
  }

  const faq = answerFaq(t);
  if (faq.text && !cs.faqAnswered.includes(faq.id!)) { parts.push(faq.text); kb.push(faq.kb!); cs.faqAnswered.push(faq.id!); }
  const svcQ = answerServiceQuestion(t, cs);
  if (svcQ.text) { parts.push(svcQ.text); kb.push(svcQ.kb!); if (svcQ.kb?.includes("escalate")) events.push({ type: "KB_GAP", message: "Caller asked about a service the line had no answer for", severity: "warn", data: { utterance: t } }); }

  if (!parts.length || Object.keys(changed).length) parts.unshift(ack(changed, cs, state.turns));

  // pricing: answer now if we can, or defer until the area is known
  const priceAsked = PRICE_QUESTION.test(t) && !/\bbudget (is|of|around|range)\b/i.test(t) && !(hint === "budget" && (changed.budget || cs.unclear.includes("budget")) && !/\?/.test(t) && !/how much|cost|price|rate/i.test(t));
  if (priceAsked || isQuoteRequest(t)) { cs.pricingAsked = true; cs.pricingPending = true; }
  if (cs.pricingPending) {
    const willAskArea = !cs.area && cs.projectScope && cs.projectScope !== "kitchen_wardrobe" && !cs.asked.includes("area");
    if (cs.projectScope && !willAskArea) {
      const p = indicativePricing(cs, t);
      parts.push(p.spoken);
      kb.push(...p.rowsUsed.map((r) => `pricing.md › ${r}`));
      if (changed.area) parts[0] = parts[0].replace(/About [\d,]+ square feet, noted\.\s*/, "").trim() || "Thanks.";
      cs.pricingPending = false; cs.pricingGiven = true; cs.pricingText = p.record || cs.pricingText; pricingSpoken = true;
      events.push({ type: "PRICING_SHOWN", message: p.sufficient ? "Indicative pricing range given" : "Per-sq-ft guidance given (no total)", data: { rows: p.rowsUsed, record: p.record } });
      if (p.escalate) { cs.pricingEscalations.push(p.escalate); events.push({ type: "PRICING_ESCALATION", severity: "warn", message: p.escalate }); }
    } else if (priceAsked) {
      if (isQuoteRequest(t)) { cs.pricingEscalations.push("Caller asked for a final/exact price"); events.push({ type: "PRICING_ESCALATION", severity: "warn", message: "Caller asked for a final/exact price" }); }
      parts.push(cs.projectScope ? "I can give you an indicative range once I know the area." : "Pricing depends on the type of project — let me understand it first, then I'll give you an indicative range.");
    }
  }

  if (state.turns >= MAX_TURNS) {
    events.push({ type: "TURN_LIMIT", severity: "warn", message: "Turn limit reached — closing and escalating" });
    return finish(state, parts, events, kb, now, pricingSpoken);
  }

  const next = nextSlot(state);
  if (next) {
    cs.asked.push(next);
    state.lastAsked = next;
    parts.push(QUESTIONS[next](cs));
    return { text: parts.join(" "), asked: next, done: false, events, kb, pricing: pricingSpoken };
  }
  state.lastAsked = undefined;
  return finish(state, parts, events, kb, now, pricingSpoken);
}

function finish(state: AgentState, parts: string[], events: AgentEvent[], kb: string[], now: Date, pricing: boolean): AgentReply {
  const cs = state.cs;
  const GENERIC = new Set(["Okay.", "Sure.", "Understood.", "Thank you, that helps.", "Okay, noted.", "That's useful, thank you."]);
  for (let i = parts.length - 1; i >= 0; i--) if (GENERIC.has(parts[i])) parts.splice(i, 1);
  const q = qualify(cs);
  state.qualification = q;
  state.done = true;
  void now;
  events.push({ type: "QUALIFICATION", message: `${q.decision} (confidence ${q.confidence})`, data: { decision: q.decision, reason: q.reason, rules: q.rules, missing: q.missing } });
  const first = cs.name ? `, ${cs.name.split(" ")[0]}` : "";
  const when = state.afterHours ? "when the studio opens at 10 AM" : "shortly";
  if (q.decision === "QUALIFIED") {
    parts.push(`Thank you${first}. I've written this up for our design team with everything you've told me, so you won't need to repeat it. A designer will call you back on this number ${when} to fix a time for your free consultation.`);
  } else if (q.decision === "NEEDS_HUMAN_REVIEW") {
    const gap = q.missing.length ? ` to go over the ${q.missing.slice(0, 2).join(" and ")}` : "";
    parts.push(`Thank you${first}. I'd rather have the right person look at this than guess, so someone from the studio will call you back ${when}${gap}.`);
  } else if (!cs.declined) {
    const essential = getKB().pricing.data.perSqft.find((r) => r.id === "home_essential");
    const msg = {
      timing: `Since you're planning to start in about ${cs.timelineMonths ? fmtMonths(cs.timelineMonths) : "a while"}, it's a little early for a design consultation. I've kept your details, and you're very welcome to call back when you're closer to starting.`,
      budget: `To be upfront with you: at that budget our full-home work may not be the right fit — our projects usually start around ₹${essential?.min.toLocaleString("en-IN") ?? "—"} per square foot. I've noted your details in case anything changes.`,
      location: `At the moment the studio takes projects in and around Pune, so I don't want to promise a site visit we can't make. I've noted your details.`,
      size: `This is a little smaller than the projects the studio usually takes on, so I don't want to book designer time that doesn't help you. I've noted your details.`,
      service: "",
    }[q.declineKind ?? "size"];
    parts.push(msg + ` Thank you for calling Aangan${first}.`);
  } else {
    parts.push(`Thank you for calling Aangan${first}.`);
  }
  return { text: parts.join(" "), done: true, events, kb, pricing };
}
