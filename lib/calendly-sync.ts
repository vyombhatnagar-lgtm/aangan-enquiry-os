import { applyCalendlyEvent, type CalendlyEvent } from "./calendly";
import { getMeta, listLeads, setMeta } from "./db";

/**
 * Booking sync that works on Calendly's FREE plan (webhooks need a paid plan).
 * Reads recent scheduled events + invitees with a personal access token and replays any new
 * booking / cancellation / no-show through the same handler the webhook uses. Idempotent.
 * Runs at most every 2 minutes, triggered when the dashboard is opened, and via /api/calendly/sync.
 */
const API = "https://api.calendly.com";
export function calendlySyncConfigured() { return !!process.env.CALENDLY_TOKEN; }

async function cal<T>(path: string): Promise<T> {
  const r = await fetch(path.startsWith("http") ? path : API + path, { headers: { Authorization: `Bearer ${process.env.CALENDLY_TOKEN}` }, cache: "no-store" });
  if (!r.ok) throw new Error(`Calendly ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json() as Promise<T>;
}

type Ev = { uri: string; name: string; status: string; start_time: string; location?: { type?: string; join_url?: string } };
type Inv = {
  uri: string; name: string; email: string; status: string; created_at: string; updated_at: string; rescheduled: boolean;
  text_reminder_number?: string | null; reschedule_url?: string; cancel_url?: string;
  cancellation?: { reason?: string; canceled_by?: string }; tracking?: { utm_campaign?: string | null; utm_source?: string | null };
  questions_and_answers?: { question: string; answer: string }[]; no_show?: { uri: string } | null;
};

export async function syncCalendly(opts: { force?: boolean } = {}) {
  if (!calendlySyncConfigured()) return { skipped: "not configured" as const };
  const last = await getMeta<string>("calendly:lastSync");
  if (!opts.force && last && Date.now() - new Date(last).getTime() < 120_000) return { skipped: "recent" as const };
  await setMeta("calendly:lastSync", new Date().toISOString());

  let user = await getMeta<string>("calendly:user");
  if (!user) { user = (await cal<{ resource: { uri: string } }>("/users/me")).resource.uri; await setMeta("calendly:user", user); }
  const since = new Date(Date.now() - 45 * 86400_000).toISOString();
  const events = (await cal<{ collection: Ev[] }>(`/scheduled_events?user=${encodeURIComponent(user)}&min_start_time=${since}&count=100&sort=start_time:desc`)).collection;
  const seen = (await getMeta<Record<string, string>>("calendly:seen")) ?? {};
  const leads = await listLeads();
  let applied = 0, unmatched = 0;

  for (const ev of events) {
    const invitees = (await cal<{ collection: Inv[] }>(`${ev.uri}/invitees?count=50`)).collection;
    for (const iv of invitees) {
      const states: string[] = ["invitee.created"];
      if (iv.status === "canceled") states.push("invitee.canceled");
      if (iv.no_show) states.push("invitee_no_show.created");
      for (const kind of states) {
        const key = `${iv.uri}|${kind}`;
        if (seen[key]) continue;
        const e: CalendlyEvent = {
          event: kind, created_at: kind === "invitee.created" ? iv.created_at : iv.updated_at,
          payload: {
            uri: iv.uri, name: iv.name, email: iv.email, text_reminder_number: iv.text_reminder_number ?? null, rescheduled: iv.rescheduled,
            reschedule_url: iv.reschedule_url, cancel_url: iv.cancel_url, cancellation: iv.cancellation, tracking: iv.tracking ?? undefined,
            questions_and_answers: iv.questions_and_answers, scheduled_event: { uri: ev.uri, start_time: ev.start_time, name: ev.name, location: ev.location },
          },
        };
        const r = await applyCalendlyEvent(e, { leads, source: "Calendly (sync)" });
        seen[key] = new Date().toISOString();
        if (r.matched) applied++; else unmatched++;
      }
    }
  }
  await setMeta("calendly:seen", seen);
  return { events: events.length, applied, unmatched };
}
