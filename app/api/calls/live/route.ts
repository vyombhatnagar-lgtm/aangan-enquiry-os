import { NextResponse } from "next/server";
import { ready } from "@/lib/db";
import { liveEnd, liveStart, liveTurn } from "@/lib/live";
import { appUrl } from "@/lib/data";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    await ready();
    const b = (await req.json()) as { action: "start" | "turn" | "end"; callId?: string; text?: string; phone?: string; mode?: string };
    if (b.action === "start") return NextResponse.json(await liveStart(b.phone?.trim() || "+91 (browser caller)", b.mode ?? "browser"));
    if (!b.callId) return NextResponse.json({ error: "callId required" }, { status: 400 });
    if (b.action === "turn") {
      if (!b.text?.trim()) return NextResponse.json({ error: "Empty utterance" }, { status: 400 });
      return NextResponse.json(await liveTurn(b.callId, b.text.trim().slice(0, 600), appUrl(req)));
    }
    if (b.action === "end") return NextResponse.json(await liveEnd(b.callId, appUrl(req)));
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
