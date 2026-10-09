import { NextResponse } from "next/server";
import { audit, callsForLead, getLead, ready, saveLead } from "@/lib/db";
import { analyzeCall } from "@/lib/intel/analysis";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Re-run the Call Intelligence layer for one lead (AI if available, heuristic otherwise). */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ready();
  const { id } = await ctx.params;
  const lead = await getLead(id);
  if (!lead) return NextResponse.json({ error: "not found" }, { status: 404 });
  const call = (await callsForLead(id)).at(-1);
  if (!call?.transcript.length) return NextResponse.json({ error: "No transcript for this lead" }, { status: 400 });
  lead.intel = await analyzeCall(lead, call.transcript, { useLLM: true });
  lead.callClass = lead.intel.callClass;
  await saveLead(lead);
  await audit({ leadId: id, at: new Date().toISOString(), type: "CALL_ANALYSED", actor: "Call intelligence", message: `Re-analysed (${lead.intel.engine}) · opportunity ${lead.intel.opportunityScore}/100` });
  return NextResponse.json({ intel: lead.intel });
}
