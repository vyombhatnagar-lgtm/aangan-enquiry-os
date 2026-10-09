import { generateObject, generateText } from "ai";
import { z } from "zod";
import type { CallState } from "./extract";
import { matchServices, parseLocation, scopeLabel } from "./extract";
import type { Slot, Turn } from "../types";

/**
 * AI Gateway (same pattern as the voicebot repo): on Vercel, auth is automatic via OIDC.
 * Locally set AI_GATEWAY_API_KEY. Every call has a timeout and a deterministic fallback,
 * so a model outage degrades the agent — it never breaks the call.
 */
export const EXTRACT_MODEL = process.env.EXTRACT_MODEL || "anthropic/claude-haiku-4.5";
export const AGENT_MODEL = process.env.AGENT_MODEL || "anthropic/claude-sonnet-4.5";

export function llmAvailable() {
  if (process.env.DISABLE_LLM === "1") return false;
  return !!(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL);
}

const ExtractSchema = z.object({
  name: z.string().nullable().describe("Caller's own name if they stated it"),
  bhk: z.number().int().nullable(),
  propertyType: z.enum(["Apartment", "Villa", "Bungalow", "Row house", "Penthouse", "Office", "Clinic"]).nullable(),
  workRequested: z.string().nullable().describe("Short phrase in the caller's words describing the work they want, e.g. 'full home interiors', 'modular kitchen only', 'restaurant fit-out'"),
  locality: z.string().nullable().describe("Locality / city of the property as said"),
  carpetAreaSqft: z.number().nullable(),
  budgetMinRupees: z.number().nullable(),
  budgetMaxRupees: z.number().nullable(),
  budgetQuote: z.string().nullable().describe("Caller's budget words verbatim"),
  startInMonths: z.number().nullable().describe("Months from today until they want to start; null if unsure"),
  timelineQuote: z.string().nullable(),
  isCorrection: z.boolean().describe("Caller is correcting something they said earlier"),
});

export interface LlmUsage { tin: number; tout: number }

/** Fills ONLY fields the rule extractor missed. Services are still matched against services.md — the model can't add a service. */
export async function llmFill(state: CallState, utterance: string, hint: Slot | undefined, history: Turn[], usage: LlmUsage): Promise<string[]> {
  if (!llmAvailable()) return [];
  try {
    const { object, usage: u } = await generateObject({
      model: EXTRACT_MODEL,
      schema: ExtractSchema,
      abortSignal: AbortSignal.timeout(6000),
      system: "You extract structured facts from an Indian interior-design enquiry phone call. Only extract what the caller actually said. Use null when not stated. Convert lakh/crore to rupees (1 lakh = 100000). Never guess.",
      prompt: `Recent conversation:\n${history.slice(-6).map((t) => `${t.speaker}: ${t.text}`).join("\n")}\n\nThe agent last asked about: ${hint ?? "nothing specific"}.\nLatest caller utterance: "${utterance}"\n\nExtract from the latest utterance (use the conversation only for context).`,
    });
    usage.tin += u?.inputTokens ?? 0; usage.tout += u?.outputTokens ?? 0;
    const filled: string[] = [];
    if (!state.name && object.name) { state.name = object.name; filled.push("name"); }
    if (!state.bhk && object.bhk) { state.bhk = object.bhk; filled.push("bhk"); }
    if (!state.propertyType && object.propertyType) { state.propertyType = object.propertyType; filled.push("propertyType"); }
    if (object.workRequested) {
      const m = matchServices(object.workRequested);
      for (const id of m.provided) if (!state.servicesRequested.includes(id)) state.servicesRequested.push(id);
      for (const id of m.excluded) if (!state.servicesExcluded.includes(id)) state.servicesExcluded.push(id);
      if (!state.projectScope && m.provided.length && !m.excluded.length) {
        const order = ["office", "design_only", "renovation", "full_home", "kitchen_wardrobe"];
        state.projectScope = order.find((o) => m.provided.includes(o)) ?? m.provided[0];
        state.projectType = scopeLabel(state.projectScope);
        filled.push("projectScope");
      }
    }
    if (!state.location && object.locality) {
      const loc = parseLocation(object.locality, "location");
      state.location = loc?.location ?? object.locality; state.inServiceArea = loc?.inServiceArea ?? null; filled.push("location");
    }
    if (!state.area && object.carpetAreaSqft && object.carpetAreaSqft > 100) { state.area = Math.round(object.carpetAreaSqft); filled.push("area"); }
    if (state.budgetMax == null && state.budgetMin == null && (object.budgetMaxRupees || object.budgetMinRupees)) {
      state.budgetMin = object.budgetMinRupees ?? undefined; state.budgetMax = object.budgetMaxRupees ?? object.budgetMinRupees ?? undefined;
      state.budgetText = object.budgetQuote ?? utterance.slice(0, 80); filled.push("budget");
    }
    if (state.timelineMonths == null && object.startInMonths != null) {
      state.timelineMonths = object.startInMonths; state.timelineText = object.timelineQuote ?? utterance.slice(0, 80); filled.push("timeline");
    }
    if (filled.length) {
      const slotsFilled = new Set(filled.map((f) => (["bhk", "propertyType", "projectScope"].includes(f) ? "project" : f)));
      state.unclear = state.unclear.filter((u) => !slotsFilled.has(u));
    }
    return filled;
  } catch (e) {
    console.warn("llmFill failed, rules only:", (e as Error).message);
    return [];
  }
}

/** Grounded summary for the designer. Falls back to the template summary on any failure. */
export async function llmSummary(transcript: Turn[], fallback: string, usage: LlmUsage): Promise<{ text: string; engine: string }> {
  if (!llmAvailable()) return { text: fallback, engine: "rules" };
  try {
    const { text, usage: u } = await generateText({
      model: AGENT_MODEL,
      abortSignal: AbortSignal.timeout(9000),
      system: "You write 3-4 sentence handoff notes for an interior designer about an inbound phone enquiry. Use only facts from the transcript. Never add prices that the agent did not say. No greetings, no bullet points. Mention anything the caller seemed unsure about.",
      prompt: transcript.map((t) => `${t.speaker}: ${t.text}`).join("\n"),
    });
    usage.tin += u?.inputTokens ?? 0; usage.tout += u?.outputTokens ?? 0;
    return { text: text.trim(), engine: AGENT_MODEL };
  } catch (e) {
    console.warn("llmSummary failed:", (e as Error).message);
    return { text: fallback, engine: "rules" };
  }
}
