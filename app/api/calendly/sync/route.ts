import { NextResponse } from "next/server";
import { ready } from "@/lib/db";
import { syncCalendly } from "@/lib/calendly-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Pull new Calendly bookings now (also runs automatically when the dashboard is opened, and daily by cron). */
export async function GET() { return run(); }
export async function POST() { return run(); }
async function run() {
  await ready();
  try { return NextResponse.json(await syncCalendly({ force: true })); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 502 }); }
}
