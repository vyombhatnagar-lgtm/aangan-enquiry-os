import { NextResponse } from "next/server";
import { clearDemo, ready, resetDemo } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/reset            → re-seed demo data (demo rows only; real enquiries are never touched)
 * POST /api/reset {clear:true} → remove all demo data for go-live
 * Disabled entirely when ALLOW_RESET=0.
 */
export async function POST(req: Request) {
  if (process.env.ALLOW_RESET === "0") return NextResponse.json({ error: "Disabled" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  await ready();
  if (body?.clear) await clearDemo(); else await resetDemo();
  return NextResponse.json({ ok: true });
}
