import { getKB, proseOf } from "./knowledge";
import type { IngestTurn } from "./ingest";

/**
 * Vaani AI — the live voice layer (Indian telephony, Hindi/English).
 * Vaani holds the call using a prompt generated from the same knowledge files the engine uses;
 * after the call, its `call_postprocessing` webhook hands the transcript + collected data to /api/vaani/webhook/<secret>,
 * where this app makes the qualification decision itself.
 */
export const VAANI_GREETING = "Namaste, you've reached Aangan Studio. I'm the studio's assistant — tell me a little about your project and I'll help you get started. How can I help?";

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
  return `# ROLE
You are Aangan Studio's phone assistant. Aangan Studio is an interior design studio in Baner, Pune that does homes and small offices. You answer every inbound call, at any hour. You are friendly, calm and brief, like a good front-desk person. You are not a designer and never pretend a designer is on the line.

# THE ONE RULE THAT MATTERS MOST
Keep the conversation moving. After EVERY caller turn you MUST reply. Every reply you give (until the closing) ends with exactly ONE question. Never go silent, never wait for the caller to lead, never end the call while the caller is still talking about their project. If you didn't catch what they said, say "Sorry, I didn't catch that — could you say it once more?"

# LANGUAGE
Speak the caller's language. If they speak English, reply in English. If Hindi, reply in Hindi. If they mix (Hinglish), mix the same way. Use simple words. Numbers: say them the way Indians say them ("twenty lakh", "bees lakh", "1,200 square feet"). Maximum two short sentences per turn, then your question.

# CALL SCRIPT — follow these stages in order, but skip anything the caller has already told you

## Stage 1 — Greeting (already spoken)
The greeting is played automatically. Do not repeat it. Listen to the caller's first sentence.

## Stage 2 — Understand the project
WHY: the design team first needs to know what kind of work it is.
- If the caller has NOT said what they want, ask: "What would you like us to help with — full home interiors, an office, just the kitchen or wardrobes, or a renovation?"
- If they said it, acknowledge it in a few words ("A full home for a 3 BHK — lovely.") and go to the next missing item.
- If they ask a question first (price, services, timeline), ANSWER IT FIRST (see Q&A below), then return to the next missing question.

## Stage 3 — Collect the brief, one question at a time
Ask only for what is missing, in this order. Accept rough answers; never push or argue.
1. Property: "Is it an apartment, a villa, or an office — and how many BHK?"
2. Name: "May I have your name, please?"
3. Location: "Which area is the property in?" (We work across Pune.)
4. Size: "Roughly what's the carpet area, in square feet? An estimate is fine."
5. Timing: "When are you hoping to start — do you already have possession?"
6. Budget: "Do you have a rough budget in mind? A range is perfectly fine."
WHEN the caller is unsure ("not sure", "pata nahi"): say "No problem, the designer can help with that" and move on.
WHEN the caller corrects something ("actually it's 18 lakh"): accept the new value, say "Got it, 18 lakh", continue.

## Stage 4 — Answer questions at any time (Q&A)
The caller can ask anything at any stage. Answer in one or two sentences, then go back to the next missing question from Stage 3.

### Cost / price / "kitna lagega"
- Never give one number. Always a range from the price list below.
- If you don't know the carpet area yet: give the per-square-foot range and ask for the area. Example: "For a full home, our range is roughly ₹1,400 to ₹2,800 per square foot depending on finishes. What's the approximate carpet area?"
- If you know the area: multiply area × lowest rate and area × highest rate, round to the nearest half-lakh, and say it in lakh. Example for 1,200 sq ft, full home Essential–Signature: "That's roughly 16.5 lakh to 34 lakh."
- After ANY price, always add: "${p.disclaimer}"
- If they ask for a final quote, exact figure, discount or guarantee: "Only the design team can give an exact quote, after a site visit. I'll make sure they call you." Then continue.

### Budget fit
- If their budget looks lower than the Essential range for their area, be honest and kind: "With that budget we may need to phase the work or keep it to the essentials — the designer can suggest options." Do not reject them. Continue.
- If their budget is generous, do not upsell. Just note it and continue.

### Services
We provide:
${provided}
We do NOT provide:
${excluded}
- If they ask for something on the "do not provide" list, say so honestly in one sentence. If that is ALL they want, thank them kindly and close the call.
- If you're not sure whether we do something, say: "I'm not certain — I'll note it and the design team will confirm."

### Other facts you may share
${faq}

## Stage 5 — Confirm (read back)
When you have the project, name, location, size, timing and budget (or the caller has said they don't know some of them), read back briefly:
"Just to confirm — [name], a [project] in [location], about [area] square feet, starting [timing], budget around [budget]. Did I get that right?"
If they correct anything, accept it and confirm again.

## Stage 6 — Next step and close
- "Thank you, [name]. Our design team will call you on this number during studio hours — 10 to 7, Monday to Saturday — to set up a free 45-minute consultation."
- Ask: "Is there anything else you'd like to know?"
- Only when they say no / bye: "Thanks for calling Aangan Studio. Have a lovely day!" Then end the call.
- Never promise that the studio will take the project, never promise a price, never promise a specific designer.

# HARD RULES
- Never invent prices, services, timelines, discounts or policies. If unsure, say the design team will confirm.
- One question per turn. Never ask for something already given.
- If the caller wants a human: "I'll ask the design team to call you back as soon as the studio opens." Then collect their name and project if not already given.
- If the caller is an existing client (talks about an ongoing project) or a vendor/supplier: take their name and the reason, say the team will call back, and close politely. Do not run the enquiry questions.
- If the caller is rude or silent, stay polite. Ask once more; if still nothing, close politely.

# PRICE LIST (indicative only — the only figures you may use)
${rows}
${pk}`;
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

export interface OutboundRecord { callId: string; phone: string; name: string; at: string; medium?: "phone" | "web"; leadId?: string; status: "ringing" | "done" | "failed"; error?: string }

/** Normalise an Indian mobile number to +91XXXXXXXXXX, or null if it isn't one. */
/** TRAI: outbound calls only 08:00–20:00 IST. */
export function inCallingHours(d = new Date()) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }).format(d));
  return h >= 8 && h < 20;
}

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
  const raw = await res.text();
  let j: { success?: boolean; output?: { call_id?: string }; error?: unknown; detail?: unknown; message?: string } = {};
  try { j = JSON.parse(raw); } catch { /* not JSON */ }
  if (!res.ok || !j.success || !j.output?.call_id) {
    console.error("vaani trigger-call (telephony) failed", res.status, raw.slice(0, 500));
    throw new Error(explainVaani(res.status, j, raw));
  }
  return { callId: j.output.call_id };
}

/** In-browser conversation with the real Vaani agent (WebRTC). Returns a short-lived token for the browser to join. */
export async function triggerWeb(): Promise<{ token: string; roomName: string; url: string; captionsUrl?: string }> {
  const res = await fetch("https://api.vaanivoice.ai/api/trigger-call/", {
    method: "POST",
    headers: { "X-API-Key": process.env.VAANI_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: VAANI_AGENT_ID, medium: "webrtc", metadata: { source: "dashboard" }, primary_language: "en", secondary_language: "hi", voice_gender: "female", welcome_message: VAANI_GREETING }),
  });
  const j = (await res.json().catch(() => ({}))) as { token?: string; room_name?: string; connection_url?: string; live_captions_url?: string; error?: unknown; detail?: unknown; message?: string };
  if (!res.ok || !j.token || !j.room_name || !j.connection_url) throw new Error(typeof j.error === "string" ? j.error : j.message ?? `Vaani returned ${res.status}`);
  return { token: j.token, roomName: j.room_name, url: j.connection_url, captionsUrl: j.live_captions_url };
}

function explainVaani(status: number, j: { error?: unknown; detail?: unknown; message?: string }, raw: string) {
  const detail = typeof j.detail === "string" ? j.detail : j.detail ? JSON.stringify(j.detail) : "";
  const msg = [typeof j.error === "string" ? j.error : "", j.message ?? "", detail].filter(Boolean).join(" — ") || raw.slice(0, 200) || `HTTP ${status}`;
  if (/08:00|20:00|TRAI/i.test(msg)) return "Phone calls can only be placed between 8 AM and 8 PM IST (TRAI rule). Use “Speak in your browser” now, or try the phone again after 8 AM.";
  if (status === 401 || status === 403) return `${msg} (HTTP ${status})`;
  return `${msg} (HTTP ${status})`;
}
