import { NextResponse } from "next/server";
import { getLead, ready } from "@/lib/db";
import { applyCalendlyEvent, fakeInviteeCreated } from "@/lib/calendly";

export const dynamic = "force-dynamic";

/** Demo only: plays the customer booking through the SAME handler a real Calendly webhook uses. */
export async function POST(req: Request) {
  if (process.env.ALLOW_RESET === "0") return NextResponse.json({ error: "Demo actions disabled" }, { status: 403 });
  try {
    await ready();
    const { leadId, action = "book" } = (await req.json()) as { leadId: string; action?: "book" | "cancel" | "noshow" };
    const lead = await getLead(leadId);
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    const evt = fakeInviteeCreated(lead, nextSlot());
    if (action === "cancel") { evt.event = "invitee.canceled"; evt.payload.uri = lead.calendly?.inviteeUri ?? evt.payload.uri; evt.payload.cancellation = { reason: "Something came up, will rebook", canceled_by: lead.customerName ?? "invitee" }; }
    if (action === "noshow") { evt.event = "invitee_no_show.created"; evt.payload.invitee = lead.calendly?.inviteeUri ?? undefined; }
    const res = await applyCalendlyEvent(evt, { source: "Calendly (simulated)" });
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** Next working day 11:00 IST. */
function nextSlot() {
  const d = new Date(Date.now() + 24 * 3600_000);
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(5, 30, 0, 0);
  return d.toISOString();
}
