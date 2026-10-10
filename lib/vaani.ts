import { getKB, proseOf } from "./knowledge";
import type { IngestTurn } from "./ingest";

/**
 * Vaani AI — the live voice layer (Indian telephony, Hindi/English).
 * Vaani holds the call using a prompt generated from the same knowledge files the engine uses;
 * after the call, its `call_postprocessing` webhook hands the transcript + collected data to /api/vaani/webhook/<secret>,
 * where this app makes the qualification decision itself.
 */
export const VAANI_GREETING = "Namaste, you've reached Aangan Studio. I'm the studio's assistant — I can understand your project and pass it to our design team. How can I help?";

export function vaaniConfigured() { return true; }

/** Path secret for the Vaani webhook: env var if set, otherwise generated once and kept in the database. */
export async function getVaaniSecret(): Promise<string> {
  if (process.env.VAANI_WEBHOOK_SECRET) return process.env.VAANI_WEBHOOK_SECRET;
  const { getMeta, setMeta } = await import("./db");
  const existing = await getMeta<string>("vaani_secret");
  if (existing) return existing;
  const s = (await import("node:crypto")).randomBytes(18).toString("base64url");
  await setMeta("vaani_secret", s);
  return s;
}

export function buildVaaniPrompt() {
  const kb = getKB();
  const p = kb.pricing.data;
  const rows = p.perSqft.map((r) => `- ${r.tier} (${r.scope.replace("_", " ")}): ₹${r.min.toLocaleString("en-IN")}–₹${r.max.toLocaleString("en-IN")} per sq ft`).join("\n");
  const pk = p.packages.map((x) => `- ${x.label}: ₹${x.min.toLocaleString("en-IN")}–₹${x.max.toLocaleString("en-IN")}`).join("\n");
  const provided = kb.services.data.provided.map((s) => `- ${s.label}`).join("\n");
  const excluded = kb.services.data.excluded.map((s) => `- ${s.label}`).join("\n");
  const faq = kb.services.data.faq.map((f) => `- ${f.answer}`).join("\n");
  return `You are the phone assistant for Aangan Studio, an interior design studio in Baner, Pune (homes and small offices). You answer inbound calls at any hour. You are not a designer and you never pretend a designer is on the line.

LANGUAGE
Reply in the caller's language. Switch between English, Hindi and Marathi as they do. Keep sentences short; this is a phone call.

YOUR JOB
Understand the project and collect only what the design team needs. Ask ONE question at a time, and never ask for something the caller already told you. Collect, in roughly this order:
1. What the project is (full home, office, kitchen only, renovation, design only) and the property (BHK / villa / office)
2. Their name
3. Where the property is (locality)
4. Approximate carpet area in square feet
5. When they want to start / possession date
6. Their budget range (a rough range is fine)
If the caller is unsure about something, accept it and move on — do not push or guess.

SERVICES — only claim what is on this list
We provide:
${provided}
We do NOT provide:
${excluded}
If someone asks for something not listed, say you're not sure and the design team will confirm. If everything they want is on the "do not provide" list, say so politely and end the call kindly.

PRICING — indicative only
You may share these indicative ranges and nothing else:
${rows}
${pk}
Rules:
- Always give a RANGE, never one number. Never say "your project will cost ₹X".
- If you don't know the carpet area, give only the per-sq-ft range.
- If you know the area and give a total, multiply area by the lowest and highest rate of the range, round the low end DOWN and the high end UP to the nearest ₹50,000, and say it in lakh (e.g. "around 18.5 lakh to 38 lakh").
- Every time you mention price, say: "${p.disclaimer}"
- If asked for a final quote, an exact or guaranteed price, or a discount: say only the design team can do that after a site visit.

THINGS YOU MAY ANSWER
${faq}

CLOSING
Thank them. Say the design team will call back on this number (during studio hours 10 AM–7 PM, Mon–Sat) to fix a time for the free consultation. Do not promise a decision about whether the studio will take the project — the studio decides that.

Never invent prices, services, timelines or policies. If you are unsure, say the design team will confirm.`;
}

/** Vaani "Data collection" points (Analysis → Extraction). Names ≤ 30 chars. Our webhook maps these by name. */
export const VAANI_DATA_POINTS = [
  { name: "customer_name", prompt: "The caller's name as they said it. null if not given.", nullable: true },
  { name: "project_type", prompt: "What work they want, in a few words, e.g. 'full home interiors', 'modular kitchen only', 'office interiors', 'renovation', 'restaurant fit-out'.", nullable: true },
  { name: "bhk", prompt: "Number of bedrooms (BHK) as a number, if a home. null otherwise.", nullable: true },
  { name: "location", prompt: "Locality and city of the property, e.g. 'Baner, Pune'.", nullable: true },
  { name: "carpet_area_sqft", prompt: "Approximate carpet area in square feet, as a number. null if unknown.", nullable: true },
  { name: "budget", prompt: "Budget exactly as the caller said it, e.g. '12 to 15 lakh'. null if not given or unsure.", nullable: true },
  { name: "timeline", prompt: "When they want to start, as said, e.g. 'next month', 'possession in March', 'in 6 weeks'. null if unsure.", nullable: true },
  { name: "requirements", prompt: "Comma-separated specific needs mentioned (kitchen, wardrobes, false ceiling, pooja unit…).", nullable: true },
  { name: "asked_price", prompt: "Did the caller ask about price? yes/no", values: ["yes", "no"], nullable: false },
  { name: "wants_human", prompt: "Did the caller ask to speak to a person or designer? yes/no", values: ["yes", "no"], nullable: false },
];

export interface VaaniWebhook {
  event: string;
  room_name?: string;
  status?: string;
  phone_number?: string;
  error?: string;
  call_duration?: number;
  end_reason?: string;
  call_id?: string;
  timestamp?: string | number;
  data?: {
    room_name?: string; call_id?: string; call_duration?: number; end_reason?: string; summary?: string;
    entities?: Record<string, unknown>; dispositions?: Record<string, unknown>; recording_url?: string; transcript?: string | { role?: string; speaker?: string; content?: string; text?: string }[];
  };
}

/** Parses "[00:00:03] AGENT: …\n\n[00:00:09] USER: …" (or "AGENT: … USER: …") into turns. */
export function parseVaaniTranscript(t: VaaniWebhook["data"] extends infer D ? D extends { transcript?: infer T } ? T : never : never): IngestTurn[] {
  if (!t) return [];
  if (Array.isArray(t)) {
    return t.map((x, i) => ({ speaker: /user|customer|caller/i.test(x.role ?? x.speaker ?? "") ? "caller" as const : "agent" as const, text: String(x.content ?? x.text ?? "").trim(), at: i * 6 })).filter((x) => x.text);
  }
  const out: IngestTurn[] = [];
  const re = /(?:\[([^\]]+)\]\s*)?\b(AGENT|USER|ASSISTANT|CUSTOMER)\s*:\s*([\s\S]*?)(?=(?:\[[^\]]+\]\s*)?\b(?:AGENT|USER|ASSISTANT|CUSTOMER)\s*:|$)/gi;
  let m: RegExpExecArray | null; let i = 0;
  while ((m = re.exec(t))) {
    const text = m[3].trim();
    if (!text) continue;
    out.push({ speaker: /user|customer/i.test(m[2]) ? "caller" : "agent", text, at: toSec(m[1]) ?? i * 6 });
    i++;
  }
  return out;
}
function toSec(ts?: string) {
  if (!ts) return undefined;
  const p = ts.trim().split(":").map(Number);
  if (p.some((x) => Number.isNaN(x))) { const d = Date.parse(ts); return Number.isNaN(d) ? undefined : undefined; }
  return p.reduce((a, b) => a * 60 + b, 0);
}

export function vaaniProse() { return proseOf(getKB().services.markdown); }

// ---------- outbound test calls: the agent rings your phone ----------
export const VAANI_AGENT_ID = process.env.VAANI_AGENT_ID ?? "8f191a5b-6fd8-4256-9337-12b891ef8600";
export function outboundConfigured() { return !!process.env.VAANI_API_KEY; }

export interface OutboundRecord { callId: string; phone: string; name: string; at: string; leadId?: string; status: "ringing" | "done" | "failed"; error?: string }

/** Normalise an Indian mobile number to +91XXXXXXXXXX, or null if it isn't one. */
export function indianMobile(raw: string): string | null {
  const d = raw.replace(/[^\d]/g, "").replace(/^(91|0)(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(d) ? `+91${d}` : null;
}

export async function triggerOutbound(o: { phone: string; name: string; skipDnd: boolean }): Promise<{ callId: string }> {
  const res = await fetch("https://api.vaanivoice.ai/api/trigger-call/", {
    method: "POST",
    headers: { "X-API-Key": process.env.VAANI_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: VAANI_AGENT_ID, medium: "telephony", contact_number: o.phone, name: o.name, metadata: { test_call: true }, dnd_check_skipped: o.skipDnd }),
  });
  const j = (await res.json().catch(() => ({}))) as { success?: boolean; output?: { call_id?: string }; error?: unknown; detail?: unknown; message?: string };
  if (!res.ok || !j.success || !j.output?.call_id) throw new Error(typeof j.error === "string" ? j.error : j.message ?? `Vaani returned ${res.status}`);
  return { callId: j.output.call_id };
}
