import crypto from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { Lead } from "./types";
import { audit, listLeads, saveLead } from "./db";
import { deriveStatus } from "./actions";
import { fmtDate } from "./format";

/**
 * Calendly = the consultation booking layer.
 * - Every qualified lead gets a prefilled booking link (utm_campaign = lead id) for the designer to share or book on the call.
 * - Calendly webhooks (invitee.created / invitee.canceled / invitee_no_show.*) move the lead's consultation stage
 *   automatically, so the funnel's "Consultation" step stops depending on someone remembering to click a button.
 * Webhooks need a paid Calendly plan (Standard or above).
 */
export const DEMO_EVENT_URL = "https://calendly.com/aangan-studio-demo/free-consultation";

export function calendlyEventUrl() { return process.env.CALENDLY_EVENT_URL || DEMO_EVENT_URL; }
export function calendlyConfigured() { return !!process.env.CALENDLY_EVENT_URL; }
export function calendlyWebhookConfigured() { return !!process.env.CALENDLY_WEBHOOK_SIGNING_KEY; }

export function bookingUrl(l: Pick<Lead, "id" | "customerName" | "phoneNumber">) {
  const u = new URL(calendlyEventUrl());
  u.searchParams.set("utm_source", "aangan-enquiry-os");
  u.searchParams.set("utm_medium", "phone");
  u.searchParams.set("utm_campaign", l.id); // how a booking finds its lead again
  if (l.customerName) u.searchParams.set("name", l.customerName);
  if (l.phoneNumber && /\d{6,}/.test(l.phoneNumber.replace(/\D/g, ""))) u.searchParams.set("a1", l.phoneNumber);
  return u.toString();
}

/** Calendly-Webhook-Signature: t=<unix>,v1=<hex hmac-sha256 of `${t}.${rawBody}`>; reject if older than 3 minutes. */
export function verifyCalendly(raw: string, header: string | null, key = process.env.CALENDLY_WEBHOOK_SIGNING_KEY, now = Date.now()) {
  if (!key || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=") as [string, string]));
  const t = parts.t, v1 = parts.v1;
  if (!t || !v1) return false;
  if (Math.abs(now / 1000 - Number(t)) > 180) return false;
  const expected = crypto.createHmac("sha256", key).update(`${t}.${raw}`).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export interface CalendlyEvent {
  event: string; // invitee.created | invitee.canceled | invitee_no_show.created | invitee_no_show.deleted
  created_at?: string;
  payload: {
    uri?: string;
    invitee?: string; // no-show payloads reference the invitee uri
    name?: string;
    email?: string;
    text_reminder_number?: string | null;
    rescheduled?: boolean;
    reschedule_url?: string;
    cancel_url?: string;
    cancellation?: { reason?: string; canceled_by?: string };
    tracking?: { utm_campaign?: string | null; utm_source?: string | null };
    questions_and_answers?: { question: string; answer: string }[];
    scheduled_event?: { uri?: string; start_time?: string; name?: string; location?: { type?: string; join_url?: string } };
  };
}

const digits = (s?: string | null) => (s ?? "").replace(/\D/g, "").slice(-10);

function matchLead(leads: Lead[], e: CalendlyEvent): { lead?: Lead; how?: string } {
  const p = e.payload;
  const byId = p.tracking?.utm_campaign && leads.find((l) => l.id === p.tracking!.utm_campaign);
  if (byId) return { lead: byId, how: "utm_campaign" };
  const inviteeUri = p.uri ?? p.invitee;
  const byUri = inviteeUri && leads.find((l) => l.calendly?.inviteeUri === inviteeUri);
  if (byUri) return { lead: byUri, how: "invitee uri" };
  const phones = [p.text_reminder_number, ...(p.questions_and_answers ?? []).map((q) => q.answer)].map(digits).filter((d) => d.length === 10);
  const byPhone = phones.length ? leads.find((l) => phones.includes(digits(l.phoneNumber))) : undefined;
  if (byPhone) return { lead: byPhone, how: "phone number" };
  return {};
}

export async function applyCalendlyEvent(e: CalendlyEvent, opts: { q?: Pool | PoolClient; leads?: Lead[]; at?: string; source?: string } = {}) {
  const at = opts.at ?? e.created_at ?? new Date().toISOString();
  const leads = opts.leads ?? (await listLeads());
  const { lead, how } = matchLead(leads, e);
  const actor = opts.source ?? "Calendly";
  if (!lead) {
    await audit({ leadId: null, at, type: "CALENDLY_UNMATCHED", actor, severity: "warn", message: `Calendly ${e.event} for ${e.payload.name ?? "unknown invitee"} matched no enquiry`, data: { event: e.event, name: e.payload.name, email: e.payload.email, phone: e.payload.text_reminder_number } }, opts.q);
    return { matched: false as const };
  }
  const p = e.payload;
  const start = p.scheduled_event?.start_time;
  switch (e.event) {
    case "invitee.created":
      lead.consultationStatus = "SCHEDULED";
      lead.consultationAt = start ?? lead.consultationAt;
      lead.consultationSource = "calendly";
      lead.calendly = { inviteeUri: p.uri ?? null, eventUri: p.scheduled_event?.uri ?? null, rescheduleUrl: p.reschedule_url ?? null, cancelUrl: p.cancel_url ?? null, bookedAt: at, joinUrl: p.scheduled_event?.location?.join_url ?? null, matchedBy: how ?? null };
      await audit({ leadId: lead.id, at, type: "CONSULTATION_SCHEDULED", actor, message: `Customer booked via Calendly for ${start ? fmtDate(start) : "—"} (matched by ${how})`, data: { calendly: lead.calendly } }, opts.q);
      break;
    case "invitee.canceled":
      if (p.rescheduled) {
        await audit({ leadId: lead.id, at, type: "CONSULTATION_RESCHEDULED", actor, message: "Customer is rescheduling on Calendly" }, opts.q);
        return { matched: true as const, lead };
      }
      lead.consultationStatus = "NOT_SCHEDULED";
      lead.consultationAt = null;
      await audit({ leadId: lead.id, at, type: "CONSULTATION_CANCELED", actor, severity: "warn", message: `Consultation canceled on Calendly${p.cancellation?.reason ? ` — "${p.cancellation.reason}"` : ""}`, data: { canceledBy: p.cancellation?.canceled_by } }, opts.q);
      break;
    case "invitee_no_show.created":
      lead.consultationStatus = "NO_SHOW";
      await audit({ leadId: lead.id, at, type: "CONSULTATION_NO_SHOW", actor, severity: "warn", message: "Marked no-show in Calendly" }, opts.q);
      break;
    case "invitee_no_show.deleted":
      lead.consultationStatus = "SCHEDULED";
      await audit({ leadId: lead.id, at, type: "CONSULTATION_SCHEDULED", actor, message: "No-show mark removed in Calendly" }, opts.q);
      break;
    default:
      return { matched: true as const, lead, ignored: true };
  }
  lead.status = deriveStatus(lead);
  await saveLead(lead, opts.q);
  return { matched: true as const, lead };
}

/** Builds the payload Calendly would send — used by the demo button and the seed so they exercise the real handler. */
export function fakeInviteeCreated(l: Lead, startIso: string, createdIso = new Date().toISOString()): CalendlyEvent {
  const id = crypto.randomUUID();
  return {
    event: "invitee.created",
    created_at: createdIso,
    payload: {
      uri: `https://api.calendly.com/scheduled_events/demo-${id}/invitees/demo`,
      name: l.customerName ?? "Customer",
      email: "customer@example.com",
      text_reminder_number: l.phoneNumber,
      reschedule_url: `${calendlyEventUrl()}/reschedule/demo-${id}`,
      cancel_url: `${calendlyEventUrl()}/cancel/demo-${id}`,
      tracking: { utm_campaign: l.id, utm_source: "aangan-enquiry-os" },
      questions_and_answers: [{ question: "Phone", answer: l.phoneNumber }],
      scheduled_event: { uri: `https://api.calendly.com/scheduled_events/demo-${id}`, start_time: startIso, name: "Free design consultation (45 min)", location: { type: "physical" } },
    },
  };
}
