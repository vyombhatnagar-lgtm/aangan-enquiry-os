import type { CostBreakdown, Turn } from "./types";

/**
 * DEMO rate card (₹). Replace with invoiced rates from your telephony / STT / TTS / LLM providers.
 * Kept in one place so the cost dashboard always shows which assumptions it is using.
 */
export const RATE_CARD = {
  label: "DEMO rate card — replace with invoiced rates",
  telephonyPerMin: 1.2, // Indian DID inbound via SIP (Exotel/Plivo-class)
  transcriptionPerMin: 0.9, // streaming STT
  ttsPerMin: 1.1, // agent speech
  llmPerMTokIn: 250, // ≈ $3 / M tokens
  llmPerMTokOut: 1250, // ≈ $15 / M tokens
  messagingPerHandoff: 0, // Telegram Bot API is free
  orchestrationPerCall: 0.4, // hosting, DB, logging share
  failedCallMinutes: 0.3,
  /** Fixed monthly costs, prorated over the reporting period. */
  fixedMonthly: { "Indian DID number rental": 1500, "Hosting (Vercel Pro)": 1750, "Database (Neon)": 1600 } as Record<string, number>,
};

export function fixedCostFor(days: number) {
  return Object.values(RATE_CARD.fixedMonthly).reduce((a, b) => a + b, 0) * (days / 30);
}

const WPM = 150;

export function estimateMinutes(transcript: Turn[]) {
  const words = transcript.reduce((n, t) => n + t.text.split(/\s+/).length, 0);
  return Math.max(0.5, words / WPM + transcript.length * 0.02);
}

/** Tokens: every agent turn re-reads the running transcript + KB grounding (~1,800 tokens). */
export function estimateTokens(transcript: Turn[]) {
  let tin = 0, tout = 0, running = 0;
  for (const t of transcript) {
    const tok = Math.ceil(t.text.length / 4);
    running += tok;
    if (t.speaker === "agent") { tin += 1800 + running; tout += tok + 120; }
  }
  // final extraction + summary pass
  tin += 1800 + running; tout += 350;
  return { tin, tout };
}

export function callCost(transcript: Turn[], opts: { handoff: boolean; failed?: boolean; measuredTokens?: { tin: number; tout: number } } = { handoff: false }): CostBreakdown {
  const r = RATE_CARD;
  const minutes = opts.failed ? r.failedCallMinutes : estimateMinutes(transcript);
  const agentShare = transcript.length ? transcript.filter((t) => t.speaker === "agent").length / transcript.length : 0.5;
  const { tin, tout } = opts.failed ? { tin: 0, tout: 0 } : opts.measuredTokens ?? estimateTokens(transcript);
  const telephony = minutes * r.telephonyPerMin;
  const transcription = opts.failed ? 0 : minutes * (1 - agentShare) * r.transcriptionPerMin * 1.6;
  const tts = opts.failed ? 0 : minutes * agentShare * r.ttsPerMin * 1.6;
  const llm = (tin / 1e6) * r.llmPerMTokIn + (tout / 1e6) * r.llmPerMTokOut;
  const messaging = opts.handoff ? r.messagingPerHandoff : 0;
  const other = r.orchestrationPerCall;
  const round = (x: number) => Math.round(x * 100) / 100;
  const parts = { telephony: round(telephony), transcription: round(transcription), tts: round(tts), llm: round(llm), messaging: round(messaging), other: round(other) };
  return { ...parts, total: round(Object.values(parts).reduce((a, b) => a + b, 0)), minutes: round(minutes), tokensIn: tin, tokensOut: tout };
}
