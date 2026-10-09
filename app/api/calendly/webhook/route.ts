import { NextResponse } from "next/server";
import { ready } from "@/lib/db";
import { applyCalendlyEvent, verifyCalendly, type CalendlyEvent } from "@/lib/calendly";

export const dynamic = "force-dynamic";

/** Calendly webhook subscription target. Signature is verified on the RAW body before anything is parsed. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyCalendly(raw, req.headers.get("calendly-webhook-signature"))) {
    return NextResponse.json({ error: "invalid or missing Calendly signature" }, { status: 401 });
  }
  try {
    await ready();
    const evt = JSON.parse(raw) as CalendlyEvent;
    const res = await applyCalendlyEvent(evt, { source: "Calendly (customer)" });
    return NextResponse.json({ ok: true, matched: res.matched, leadId: res.matched ? res.lead?.id : null });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
