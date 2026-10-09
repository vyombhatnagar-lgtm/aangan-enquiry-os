import type { Lead } from "./types";
import { inr } from "./format";

/** Builds the Telegram message. Telegram is a notification layer — the lead record in Postgres is the system of record. */
export function buildHandoffMessage(l: Lead, appUrl?: string): string {
  const area = l.approximateArea ? `${l.approximateArea} sq ft` : "Not captured";
  const budget = l.budget ? `${l.budget}${l.budgetMax ? ` (${l.budgetMin && l.budgetMin !== l.budgetMax ? `${inr(l.budgetMin)}–` : ""}${inr(l.budgetMax)})` : ""}` : "Not captured";
  const lines = [
    "🔔 NEW AANGAN ENQUIRY",
    "",
    "Customer:", l.customerName || "Not given",
    "",
    "Phone:", l.phoneNumber,
    "",
    "Project:", l.projectType || "—",
    "",
    "Property:", [l.bhk ? `${l.bhk} BHK` : null, l.propertyType].filter(Boolean).join(" ") || "—",
    "",
    "Location:", l.location || "—",
    "",
    "Approx. Area:", area,
    "",
    "Budget:", budget,
    "",
    "Timeline:", l.timeline || "—",
    "",
    "Requirements:", l.requirements.length ? l.requirements.join(", ") : "—",
    "",
    "Qualification:", `${l.decision}${l.confidenceScore != null ? ` (confidence ${l.confidenceScore})` : ""}${l.highValue ? " · HIGH VALUE" : ""}`,
    "",
    "Reason:", l.qualificationReason || "—",
    "",
    "Indicative Pricing Discussed:", l.indicativePricingShown ? l.indicativePricingText || "Yes" : "No",
    "",
    "Conversation Summary:", l.conversationSummary || "—",
    "",
    "Recommended Next Action:", l.recommendedAction || "—",
  ];
  if (l.bookingUrl) lines.push("", "Book the free consultation (Calendly, prefilled — share with the customer or book while on the call):", l.bookingUrl);
  if (appUrl) lines.push("", `Full record: ${appUrl}/leads/${l.id}`);
  lines.push("", `Lead ${l.id}${l.afterHours ? " · received after hours" : ""}`);
  return lines.join("\n");
}

export function telegramConfigured() {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

export async function sendTelegram(text: string, leadId: string): Promise<{ ok: boolean; channel: "telegram" | "simulated"; error?: string; messageId?: number }> {
  if (!telegramConfigured()) return { ok: true, channel: "simulated" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: text.slice(0, 4000),
        reply_markup: { inline_keyboard: [[{ text: "✅ Acknowledge", callback_data: `ack:${leadId}` }, { text: "📞 Contacted", callback_data: `contacted:${leadId}` }]] },
      }),
      signal: AbortSignal.timeout(8000),
    });
    const j = (await res.json()) as { ok: boolean; description?: string; result?: { message_id: number } };
    if (!j.ok) return { ok: false, channel: "telegram", error: j.description ?? `HTTP ${res.status}` };
    return { ok: true, channel: "telegram", messageId: j.result?.message_id };
  } catch (e) {
    return { ok: false, channel: "telegram", error: (e as Error).message };
  }
}
