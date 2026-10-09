import { NextResponse } from "next/server";
import { ready } from "@/lib/db";
import { SCENARIOS } from "@/lib/seed/personas";
import { runScripted } from "@/lib/engine/simulate";
import { completeCall, newId, summarize } from "@/lib/pipeline";
import { llmSummary } from "@/lib/engine/llm";
import { appUrl } from "@/lib/data";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    await ready();
    const { scenario = "qualified", afterHours } = (await req.json().catch(() => ({}))) as { scenario?: string; afterHours?: boolean };
    const sc = SCENARIOS[scenario];
    if (!sc) return NextResponse.json({ error: `Unknown scenario ${scenario}` }, { status: 400 });
    const persona = sc.persona();
    persona.phone = `+91 9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0").replace(/^(\d{4})(\d{5})$/, "$1 $2")}`;
    let at = new Date();
    if (afterHours) { at = new Date(at); at.setUTCHours(17, 10 + Math.floor(Math.random() * 40), 0, 0); } // 22:40-ish IST today
    const r = runScripted(persona, at);
    const usage = { tin: 0, tout: 0 };
    const fallback = summarize(r.state.cs, r.state.qualification!, r.state.afterHours);
    const sum = await llmSummary(r.transcript, fallback, usage);
    const res = await completeCall({
      state: r.state, transcript: r.transcript, events: r.events, phone: persona.phone, startedAt: at, callId: newId("CALL", at),
      engine: sum.engine === "rules" ? "rules (simulated caller)" : `rules + ${sum.engine}`, isDemo: true, responseTimeSeconds: r.answerSec,
      deliverHandoff: true, analyseWithAI: true, summary: sum.engine === "rules" ? undefined : sum.text, appUrl: appUrl(req),
    });
    return NextResponse.json({ scenario: { key: scenario, ...sc, persona: undefined }, lead: res.lead, call: res.call, audits: res.audits, qualification: r.state.qualification });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
