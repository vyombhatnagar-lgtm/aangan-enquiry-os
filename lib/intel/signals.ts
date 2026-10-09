import type { Turn } from "../types";
import type { ConversationSignals } from "./types";

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Stage 4 — conversation signals computed from speaker turns (feeds the OpportunityEngine). */
export function conversationSignals(transcript: Turn[]): ConversationSignals {
  const caller = transcript.filter((t) => t.speaker === "caller");
  const agent = transcript.filter((t) => t.speaker === "agent");
  const cw = caller.reduce((n, t) => n + words(t.text), 0);
  const aw = agent.reduce((n, t) => n + words(t.text), 0);
  const total = cw + aw || 1;
  const q = (ts: Turn[]) => ts.reduce((n, t) => n + (t.text.match(/\?/g)?.length ?? 0) + (/\b(how much|what|when|do you|can you|is it|will you)\b/i.test(t.text) && !t.text.includes("?") ? 1 : 0), 0);
  return {
    turns: transcript.filter((t) => t.speaker !== "system").length,
    callerTalkRatio: cw / total,
    agentTalkRatio: aw / total,
    callerQuestions: q(caller),
    agentQuestions: q(agent),
    avgCallerWords: caller.length ? Math.round(cw / caller.length) : 0,
    priceMentions: caller.filter((t) => /\b(cost|price|how much|budget|expensive|rate|quote|lakh)\b/i.test(t.text)).length,
    hesitations: caller.filter((t) => /\b(not sure|maybe|let me think|depends|no idea|i think|don'?t know)\b/i.test(t.text)).length,
  };
}

/**
 * OpportunityEngine — score = (intent_value × 0.6) + (customer_talk_ratio × 100 × 0.4)
 * intent_value: high → 100, medium → 50, low → 10.
 * A ranking aid for the design team. It does NOT decide qualification — qualified.md does.
 */
export function opportunityScore(buyerSignals: "high" | "medium" | "low", s: ConversationSignals) {
  const intent = { high: 100, medium: 50, low: 10 }[buyerSignals];
  return Math.round(Math.min(100, intent * 0.6 + Math.min(1, s.callerTalkRatio) * 100 * 0.4));
}
