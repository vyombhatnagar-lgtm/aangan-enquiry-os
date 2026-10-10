import { NextResponse } from "next/server";
import { getMeta, ready, setMeta } from "@/lib/db";
import { outboundConfigured, triggerWeb, type OutboundRecord } from "@/lib/vaani";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DAILY_LIMIT = Number(process.env.OUTBOUND_DAILY_LIMIT ?? 20);

/** POST → join token for a live in-browser conversation with the Vaani agent. The finished call arrives via the webhook. */
export async function POST() {
  if (!outboundConfigured()) return NextResponse.json({ error: "The agent isn't connected yet." }, { status: 503 });
  await ready();
  const day = new Date().toISOString().slice(0, 10);
  const used = (await getMeta<number>(`outbound-count:${day}`)) ?? 0;
  if (used >= DAILY_LIMIT) return NextResponse.json({ error: `Daily limit of ${DAILY_LIMIT} test conversations reached.` }, { status: 429 });
  try {
    const w = await triggerWeb();
    const rec: OutboundRecord = { callId: w.roomName, phone: "Web call", name: "", at: new Date().toISOString(), status: "ringing", medium: "web" };
    await setMeta(`outbound:${w.roomName}`, rec);
    await setMeta("outbound:last", rec);
    await setMeta(`outbound-count:${day}`, used + 1);
    return NextResponse.json(w);
  } catch (e) {
    return NextResponse.json({ error: `Couldn't connect to the agent: ${(e as Error).message}` }, { status: 502 });
  }
}
