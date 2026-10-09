import { agentTurn, startAgent, type AgentState } from "./conversation";
import type { TimedEvent } from "../pipeline";
import type { Slot, Turn } from "../types";
import { isAfterHours } from "../format";

/** A simulated caller: answers whatever the agent asks from a fact sheet, so the agent's question order stays real. */
export interface Persona {
  key: string;
  label?: string;
  phone: string;
  open: string;
  answers: Partial<Record<Slot, string>>;
  extras?: { after: Slot; text: string }[];
  closing?: string;
}

const DEFAULT_UNSURE: Record<Slot, string> = {
  name: "I'd rather not say right now.",
  project: "Just some interior work, I'll know more later.",
  location: "I'll share that later.",
  area: "I'm not sure of the exact area.",
  services: "Not sure yet.",
  timeline: "Not sure yet, depends on a few things.",
  budget: "No idea honestly, you tell me.",
};

const speakSec = (t: string) => Math.max(1.2, t.split(/\s+/).length / 2.6);

export function runScripted(p: Persona, startedAt: Date) {
  const afterHours = isAfterHours(startedAt);
  const { state, reply } = startAgent(afterHours);
  const transcript: Turn[] = [];
  const events: TimedEvent[] = [];
  let clock = 2.4; // ring → answer
  const answerSec = clock;
  transcript.push({ speaker: "agent", text: reply.text, at: clock });
  for (const e of reply.events) events.push({ ...e, offset: clock });
  clock += speakSec(reply.text) + 0.6;

  let callerText = p.open;
  let r = reply;
  const used = new Set<string>();
  for (let i = 0; i < 20 && !state.done; i++) {
    transcript.push({ speaker: "caller", text: callerText, at: clock });
    clock += speakSec(callerText) + 0.8;
    r = agentTurn(state, callerText, startedAt);
    transcript.push({ speaker: "agent", text: r.text, at: clock, meta: { slot: r.asked, kb: r.kb, pricing: r.pricing, extracted: snapshot(state), event: r.events.map((e) => e.type).join(",") } });
    for (const e of r.events) events.push({ ...e, offset: clock });
    clock += speakSec(r.text) + 0.6;
    if (r.done) break;
    callerText = answer(p, r.asked, used, state);
  }
  if (p.closing) transcript.push({ speaker: "caller", text: p.closing, at: clock });
  else transcript.push({ speaker: "caller", text: "Okay, thank you.", at: clock });
  return { state: state as AgentState, transcript, events, answerSec };
}

export function snapshot(state: AgentState): Record<string, unknown> {
  const c = state.cs;
  return {
    name: c.name ?? null,
    project: c.projectType ? `${c.projectType}${c.bhk ? ` · ${c.bhk} BHK` : ""}${c.propertyType && c.propertyType !== "Apartment" ? ` · ${c.propertyType}` : ""}` : c.servicesExcluded.length ? "Out of scope" : null,
    location: c.location ?? null,
    area: c.area ?? null,
    timeline: c.timelineText ?? null,
    budget: c.budgetText ?? null,
    requirements: [...c.requirements],
    pricing: c.pricingText ?? null,
    corrections: c.corrections.length,
    contradictions: [...c.contradictions],
    unclear: [...c.unclear],
  };
}

function answer(p: Persona, slot: Slot | undefined, used: Set<string>, state: AgentState): string {
  let t = slot ? p.answers[slot] ?? DEFAULT_UNSURE[slot] : "Okay.";
  for (const x of p.extras ?? []) {
    const k = `${x.after}:${x.text}`;
    if (x.after === slot && !used.has(k)) { t = `${t} ${x.text}`; used.add(k); }
  }
  void state;
  return t;
}
