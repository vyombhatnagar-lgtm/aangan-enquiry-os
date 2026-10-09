import { NextResponse } from "next/server";
import { callsForLead, listLeads, ready, saveLead } from "@/lib/db";
import { analyzeCall } from "@/lib/intel/analysis";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Batch analysis — the reference pipeline's orchestration, adapted:
 * 10 parallel workers, checkpoint resume (already-analysed leads are skipped unless force),
 * skip-on-exception (one failed lead never blocks the batch).
 */
export async function POST(req: Request) {
  await ready();
  const { force = false, limit = 60 } = (await req.json().catch(() => ({}))) as { force?: boolean; limit?: number };
  const all = await listLeads();
  const todo = all.filter((l) => force || !l.intel || l.intel.engine.startsWith("heuristic")).slice(0, limit);
  const WORKERS = 10;
  const res = { analysed: 0, skipped: all.length - todo.length, failed: [] as string[], ai: 0 };
  let i = 0;
  await Promise.all(Array.from({ length: WORKERS }, async () => {
    while (i < todo.length) {
      const l = todo[i++];
      try {
        const call = (await callsForLead(l.id)).at(-1);
        if (!call?.transcript.length) { res.skipped++; continue; }
        l.intel = await analyzeCall(l, call.transcript, { useLLM: true });
        l.callClass = l.intel.callClass;
        await saveLead(l);
        res.analysed++; if (!l.intel.engine.startsWith("heuristic")) res.ai++;
      } catch (e) { res.failed.push(`${l.id}: ${(e as Error).message}`); }
    }
  }));
  return NextResponse.json(res);
}
