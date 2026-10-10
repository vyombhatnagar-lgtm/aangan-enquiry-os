import { NextResponse } from "next/server";
import { ready } from "@/lib/db";

export const dynamic = "force-dynamic";
export async function GET() {
  let ok = true;
  try { await ready(); } catch { ok = false; }
  return NextResponse.json({ ok }, { status: ok ? 200 : 503 });
}
