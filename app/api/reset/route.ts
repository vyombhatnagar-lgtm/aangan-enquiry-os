import { NextResponse } from "next/server";
import { ready, resetDemo } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  if (process.env.ALLOW_RESET === "0") return NextResponse.json({ error: "Reset disabled" }, { status: 403 });
  await ready();
  await resetDemo();
  return NextResponse.json({ ok: true });
}
