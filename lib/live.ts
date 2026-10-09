import { extractStep, respondStep, startAgent, type AgentState } from "./engine/conversation";
import { llmFill, llmSummary, type LlmUsage } from "./engine/llm";
import { snapshot } from "./engine/simulate";
import { qualify } from "./engine/qualify";
import { completeCall, newId, summarize, type TimedEvent } from "./pipeline";
import { getCall, saveCall } from "./db";
import { callCost } from "./costs";
import { isAfterHours } from "./format";
import type { Call, Turn } from "./types";

type LiveCall = Call & { live: true; agentState: AgentState; events: TimedEvent[]; usage: LlmUsage; answerSec: number; mode: string };

/**
 * Live calls (browser mic, or a telephony provider streaming turns). State lives in Postgres between turns,
 * so this works on serverless. The transcript is written on every turn — a dropped call never loses it.
 */
export async function liveStart(phone: string, mode: string) {
  const at = new Date();
  const { state, reply } = startAgent(isAfterHours(at));
  const call: LiveCall = {
    id: newId("CALL", at), leadId: null, phone, startedAt: at.toISOString(), durationSec: 0, status: "ANSWERED", afterHours: state.afterHours,
    transcript: [{ speaker: "agent", text: reply.text, at: 1.2 }], cost: callCost([], { handoff: false }), engine: "rules", live: true,
    agentState: state, events: reply.events.map((e) => ({ ...e, offset: 1.2 })), usage: { tin: 0, tout: 0 }, answerSec: 1.2, mode,
  };
  await saveCall(call);
  return { callId: call.id, reply: reply.text, snapshot: snapshot(state) };
}

export async function liveTurn(callId: string, text: string, appUrl?: string) {
  const call = (await getCall(callId)) as LiveCall | null;
  if (!call || !call.live) throw new Error("Call not found or already finished");
  const st = call.agentState;
  const offset = (Date.now() - new Date(call.startedAt).getTime()) / 1000;
  call.transcript.push({ speaker: "caller", text, at: offset });
  const { changed, correction } = extractStep(st, text, new Date());
  const filled = await llmFill(st.cs, text, st.lastAsked, call.transcript, call.usage);
  for (const f of filled) changed[f] = true;
  if (filled.length) call.engine = "rules + AI Gateway";
  const r = respondStep(st, text, changed, correction);
  const at2 = (Date.now() - new Date(call.startedAt).getTime()) / 1000;
  call.transcript.push({ speaker: "agent", text: r.text, at: at2, meta: { slot: r.asked, kb: r.kb, pricing: r.pricing, extracted: snapshot(st) } });
  for (const e of r.events) call.events.push({ ...e, offset: at2 });
  if (filled.length) call.events.push({ type: "AI_EXTRACTION", message: `AI Gateway filled: ${filled.join(", ")}`, offset: at2 });
  if (r.done) {
    const res = await finalize(call, appUrl);
    return { reply: r.text, done: true, snapshot: snapshot(st), lead: res.lead, qualification: st.qualification };
  }
  call.durationSec = at2;
  await saveCall(call);
  return { reply: r.text, done: false, snapshot: snapshot(st), asked: r.asked };
}

/** Caller hung up early: qualify on what we have (usually → human review), keep the transcript. */
export async function liveEnd(callId: string, appUrl?: string) {
  const call = (await getCall(callId)) as LiveCall | null;
  if (!call || !call.live) throw new Error("Call not found or already finished");
  const st = call.agentState;
  st.qualification = qualify(st.cs);
  st.done = true;
  const at = (Date.now() - new Date(call.startedAt).getTime()) / 1000;
  call.transcript.push({ speaker: "system", text: "Caller ended the call", at });
  call.events.push({ type: "CALL_ENDED_EARLY", message: "Caller ended the call before the agent finished", severity: "warn", offset: at });
  call.events.push({ type: "QUALIFICATION", message: `${st.qualification.decision} (confidence ${st.qualification.confidence})`, offset: at, data: { decision: st.qualification.decision } });
  const res = await finalize(call, appUrl);
  return { lead: res.lead, qualification: st.qualification, snapshot: snapshot(st) };
}

async function finalize(call: LiveCall, appUrl?: string) {
  const st = call.agentState;
  const fallback = summarize(st.cs, st.qualification!, call.afterHours);
  const sum = await llmSummary(call.transcript, fallback, call.usage);
  const measured = call.usage.tin ? { tin: call.usage.tin + 1800 * call.transcript.length, tout: call.usage.tout } : undefined;
  const res = await completeCall({
    state: st, transcript: call.transcript as Turn[], events: call.events, phone: call.phone, startedAt: new Date(call.startedAt), callId: call.id,
    engine: sum.engine !== "rules" ? `rules + ${sum.engine}` : call.engine, isDemo: false, responseTimeSeconds: call.answerSec, deliverHandoff: true, analyseWithAI: true,
    summary: sum.engine !== "rules" ? sum.text : undefined, tokens: measured, appUrl,
  });
  return res;
}
