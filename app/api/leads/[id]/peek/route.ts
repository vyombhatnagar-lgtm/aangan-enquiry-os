import { NextResponse } from "next/server";
import { callsForLead, getLead, ready } from "@/lib/db";

export const dynamic = "force-dynamic";
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ready();
  const { id } = await ctx.params;
  const lead = await getLead(id);
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });
  const calls = await callsForLead(id);
  return NextResponse.json({ lead, call: calls.at(-1) ?? null });
}
