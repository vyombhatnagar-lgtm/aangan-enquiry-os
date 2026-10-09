import { NextResponse } from "next/server";
import { ready } from "@/lib/db";
import { ingestTranscript } from "@/lib/ingest";
import { appUrl } from "@/lib/data";

export const dynamic = "force-dynamic";

/**
 * Generic telephony adapter (end-of-call webhook) for providers other than Vaani (Exotel, Plivo, Vapi…).
 * Body: { phone, startedAt?, transcript: [{ role: "assistant"|"user", text, secondsFromStart? }], entities? }
 * Header: x-aangan-secret must equal TELEPHONY_WEBHOOK_SECRET when that env var is set.
 */
export async function POST(req: Request) {
  const secret = process.env.TELEPHONY_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-aangan-secret") !== secret) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  try {
    await ready();
    const b = (await req.json()) as { phone: string; startedAt?: string; transcript: { role: string; text: string; secondsFromStart?: number }[]; entities?: Record<string, unknown> };
    if (!b.phone || !Array.isArray(b.transcript)) return NextResponse.json({ error: "phone and transcript required" }, { status: 400 });
    const turns = b.transcript.map((t, i) => ({ speaker: /user|customer|caller/i.test(t.role) ? "caller" as const : "agent" as const, text: t.text, at: t.secondsFromStart ?? i * 6 }));
    const res = await ingestTranscript({ phone: b.phone, startedAt: b.startedAt ? new Date(b.startedAt) : new Date(), turns, entities: b.entities, engine: "telephony webhook", appUrl: appUrl(req) });
    return NextResponse.json({ leadId: res.lead.id, decision: res.lead.decision });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
