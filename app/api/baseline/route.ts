import { NextResponse } from "next/server";
import { ready, saveBaseline } from "@/lib/db";
import { DEMO_BASELINE } from "@/lib/seed/seed";
import type { Baseline } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await ready();
    const b = (await req.json()) as Partial<Baseline> & { restoreDemo?: boolean };
    if (b.restoreDemo) { await saveBaseline({ ...DEMO_BASELINE, updatedAt: new Date().toISOString() }); return NextResponse.json({ ok: true }); }
    const n = (k: keyof Baseline) => { const v = Number(b[k]); if (!Number.isFinite(v) || v < 0) throw new Error(`${String(k)} must be a number`); return v; };
    const baseline: Baseline = {
      label: String(b.label || "Manual process"), source: "ENTERED", period: String(b.period || ""), enquiries: n("enquiries"), responded5min: n("responded5min"),
      qualified: n("qualified"), handoffs: n("handoffs"), consultations: n("consultations"), won: n("won"), revenue: n("revenue"),
      design: (["PRE_POST", "RANDOMISED"].includes(String(b.design)) ? b.design : "PRE_POST") as Baseline["design"], notes: String(b.notes || ""), updatedAt: new Date().toISOString(),
    };
    if (!baseline.enquiries) throw new Error("Baseline enquiries must be above zero");
    if (baseline.won > baseline.enquiries) throw new Error("Won cannot exceed enquiries");
    await saveBaseline(baseline);
    return NextResponse.json({ ok: true, baseline });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
