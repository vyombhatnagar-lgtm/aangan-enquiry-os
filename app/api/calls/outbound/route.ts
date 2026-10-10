import { NextResponse } from "next/server";
import { getLead, getMeta, ready, setMeta } from "@/lib/db";
import { plain } from "@/lib/format";
import { indianMobile, outboundConfigured, triggerOutbound, type OutboundRecord } from "@/lib/vaani";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DAILY_LIMIT = Number(process.env.OUTBOUND_DAILY_LIMIT ?? 20);

/** POST {phone, name, skipDnd} → the agent calls that phone. The finished call arrives through the Vaani webhook as a test enquiry. */
export async function POST(req: Request) {
  if (!outboundConfigured()) return NextResponse.json({ error: "Phone calling isn't connected yet." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { phone?: string; name?: string; skipDnd?: boolean };
  const phone = indianMobile(b.phone ?? "");
  if (!phone) return NextResponse.json({ error: "Enter a 10-digit Indian mobile number." }, { status: 400 });
  const name = (b.name ?? "").trim().slice(0, 60) || "Test caller";
  await ready();
  const day = new Date().toISOString().slice(0, 10);
  const used = (await getMeta<number>(`outbound-count:${day}`)) ?? 0;
  if (used >= DAILY_LIMIT) return NextResponse.json({ error: `Daily limit of ${DAILY_LIMIT} test calls reached.` }, { status: 429 });
  try {
    const { callId } = await triggerOutbound({ phone, name, skipDnd: !!b.skipDnd });
    const rec: OutboundRecord = { callId, phone, name, at: new Date().toISOString(), status: "ringing" };
    await setMeta(`outbound:${callId}`, rec);
    await setMeta("outbound:last", rec);
    await setMeta(`outbound-count:${day}`, used + 1);
    return NextResponse.json({ callId });
  } catch (e) {
    return NextResponse.json({ error: `Couldn't start the call: ${(e as Error).message}` }, { status: 502 });
  }
}

/** GET ?id=<callId> → status; once the call is processed, the lead it created. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await ready();
  const rec = await getMeta<OutboundRecord>(`outbound:${id}`);
  if (!rec) return NextResponse.json({ error: "unknown call" }, { status: 404 });
  if (rec.leadId) {
    const lead = await getLead(rec.leadId);
    return NextResponse.json({ status: "done", leadId: rec.leadId, decision: lead?.decision, name: lead?.customerName, summary: plain(lead?.conversationSummary) });
  }
  return NextResponse.json({ status: rec.status, error: rec.error });
}
