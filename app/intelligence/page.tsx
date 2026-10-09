import Link from "next/link";
import { listLeads } from "@/lib/db";
import { fmtDate, inrShort } from "@/lib/format";
import { SecHead, Stat, Pill } from "@/components/ui";
import { ScoreRing } from "@/components/IntelPanel";
import { BatchButton } from "@/components/IntelActions";
import { INTEL_MODEL } from "@/lib/intel/analysis";
import { llmAvailable } from "@/lib/engine/llm";
import type { ObjectionDetail } from "@/lib/intel/types";

export const dynamic = "force-dynamic";

const STAGES: { n: number; t: string; d: string; k: "io" | "ai" | "rule" }[] = [
  { n: 1, t: "Call capture", d: "Vaani AI answers the +91 line 24×7; simulator and browser mic for demos.", k: "io" },
  { n: 2, t: "Transcription", d: "Vaani STT, Hindi with English fallback; transcript posted on call_postprocessing.", k: "ai" },
  { n: 3, t: "Diarization & format", d: "Turns parsed into Agent: … / Customer: … blocks with timestamps.", k: "io" },
  { n: 4, t: "Conversation signals", d: "Talk ratio, questions, avg response length, price mentions, hesitations.", k: "rule" },
  { n: 5, t: "Classification gate", d: "ENQUIRY vs EXISTING CLIENT vs VENDOR. Only enquiries enter the funnel.", k: "rule" },
  { n: 6, t: "Qualification", d: "Explicit rules from qualified.md decide QUALIFIED / REVIEW / NOT. AI never overrides.", k: "rule" },
  { n: 7, t: "Structured analysis + scoring", d: "CallAnalysis schema via Gemini 2.5 Flash; OpportunityEngine; Phoenix Protocol.", k: "ai" },
];

export default async function Intelligence() {
  const all = await listLeads();
  const analysed = all.filter((l) => l.intel);
  const enquiries = analysed.filter((l) => l.intel!.callClass === "ENQUIRY");
  const nonEnq = analysed.filter((l) => l.intel!.callClass !== "ENQUIRY");
  const open = enquiries.filter((l) => l.decision === "QUALIFIED" && l.projectOutcome === "PENDING").sort((a, b) => b.intel!.opportunityScore - a.intel!.opportunityScore);
  const objs = enquiries.flatMap((l) => l.intel!.objections);
  const types: ObjectionDetail["type"][] = ["price", "delay", "confusion", "trust", "competition", "scope"];
  const byType = types.map((t) => ({ t, n: objs.filter((o) => o.type === t).length, ok: objs.filter((o) => o.type === t && o.resolved).length }));
  const maxT = Math.max(1, ...byType.map((x) => x.n));
  const recovery = enquiries.filter((l) => l.intel!.phoenix && l.intel!.phoenix.verdict !== "DEAD_LEAD")
    .map((l) => ({ l, due: new Date(new Date(l.enquiryAt).getTime() + l.intel!.phoenix!.waitDays * 86400000) }))
    .sort((a, b) => (b.l.intel!.phoenix!.verdict === "HIGH_PRIORITY_RECOVERY" ? 1 : 0) - (a.l.intel!.phoenix!.verdict === "HIGH_PRIORITY_RECOVERY" ? 1 : 0) || a.due.getTime() - b.due.getTime());
  const themes = new Map<string, number>();
  for (const l of enquiries) for (const a of l.intel!.agentImprovementAreas) themes.set(a.skill, (themes.get(a.skill) ?? 0) + 1);
  const themeList = [...themes.entries()].sort((a, b) => b[1] - a[1]);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
  const aiCount = analysed.filter((l) => !l.intel!.engine.startsWith("heuristic")).length;
  const won = enquiries.filter((l) => l.projectOutcome === "WON"), lost = enquiries.filter((l) => l.projectOutcome === "LOST");

  return (
    <div className="page">
      <section className="intel-hero">
        <div className="eyebrow" style={{ color: "#d9b98a" }}>Aangan Studio · Enquiry OS · layer 2</div>
        <h1 style={{ marginTop: 8 }}>Call Intelligence</h1>
        <p>Qualification tells the studio <i>whether</i> an enquiry deserves designer time. This layer tells the designer <i>how to win it</i>: what the caller objected to, how strong the buying signals were, who to call first, and how to revive the ones that stalled.</p>
        <div className="pills">
          <span>{INTEL_MODEL} via AI Gateway</span><span>Classification gate</span><span>OpportunityEngine</span><span>Phoenix Protocol</span><span>10 parallel workers</span><span>Structured output (zod)</span><span>Heuristic fallback</span>
        </div>
      </section>

      <div className="row between" style={{ margin: "18px 0 6px" }}>
        <span className="small muted">{analysed.length} calls analysed · {aiCount} by AI, {analysed.length - aiCount} by the heuristic fallback{!llmAvailable() && " (AI Gateway not configured)"}</span>
        <BatchButton />
      </div>

      <div className="grid g5" style={{ marginTop: 10 }}>
        <Stat label="Enquiry calls" value={enquiries.length} sub={`${nonEnq.length} non-enquiry calls kept out of the funnel`} />
        <Stat label="Avg opportunity · open qualified" value={avg(open.map((l) => l.intel!.opportunityScore))} sub="0–100, OpportunityEngine" />
        <Stat label="Opportunity · won vs lost" value={`${avg(won.map((l) => l.intel!.opportunityScore))} / ${avg(lost.map((l) => l.intel!.opportunityScore))}`} sub="does the score predict outcomes?" />
        <Stat label="Objections per call" value={(objs.length / Math.max(1, enquiries.length)).toFixed(1)} sub={`${objs.filter((o) => o.resolved).length}/${objs.length} handled on the call`} />
        <Stat label="Recovery queue" value={recovery.length} sub={`${recovery.filter((r) => r.l.intel!.phoenix!.verdict === "HIGH_PRIORITY_RECOVERY").length} high-priority`} />
      </div>

      <section className="sec">
        <SecHead eyebrow="Who to call first" title="Open qualified enquiries, ranked by opportunity" right="Ranking aid only — qualification came from qualified.md" />
        <div className="card tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Score</th><th>Customer</th><th>Project</th><th>Signals</th><th>Deal</th><th>Biggest risk</th><th>Stage</th></tr></thead>
            <tbody>
              {open.map((l) => (
                <tr key={l.id}>
                  <td style={{ width: 70 }}><ScoreRing score={l.intel!.opportunityScore} size={54} label="" /></td>
                  <td><Link className="rowlink" href={`/leads/${l.id}`}>{l.customerName ?? "Unknown"}</Link><div className="tiny muted">{fmtDate(l.enquiryAt)}</div></td>
                  <td className="small">{[l.bhk ? `${l.bhk} BHK` : l.projectType, l.location?.replace(", Pune", "")].filter(Boolean).join(" · ")}<div className="tiny muted">{l.budget}</div></td>
                  <td><Pill s={l.intel!.buyerSignals === "high" ? "QUALIFIED" : l.intel!.buyerSignals === "low" ? "NOT_QUALIFIED" : "NEEDS_HUMAN_REVIEW"} label={`${l.intel!.buyerSignals}`} /></td>
                  <td className="small">{Math.round(l.intel!.dealProbability * 100)}%</td>
                  <td className="small ink2" style={{ maxWidth: 320 }}>{l.intel!.lostOpportunityReason}</td>
                  <td><Pill s={l.status} /></td>
                </tr>
              ))}
              {!open.length && <tr><td colSpan={7} className="empty-state">No open qualified enquiries.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid g2 sec" style={{ alignItems: "start" }}>
        <div>
          <SecHead eyebrow="Objections" title="What callers push back on" />
          <div className="card card-pad">
            {byType.map((x) => (
              <div key={x.t} className="hbar"><span style={{ textTransform: "capitalize" }}>{x.t}</span><div className="tr"><i style={{ width: `${(x.n / maxT) * 100}%` }} /><em style={{ width: `${(x.ok / maxT) * 100}%` }} /></div><span className="mono tiny">{x.ok}/{x.n} handled</span></div>
            ))}
            <p className="tiny muted" style={{ marginTop: 8 }}><span style={{ color: "var(--sage)" }}>■</span> handled on the call <span style={{ color: "var(--terra)", marginLeft: 8 }}>■</span> raised</p>
          </div>
        </div>
        <div>
          <SecHead eyebrow="Voice-agent backlog" title="What the Vaani prompt should get better at" />
          <div className="card card-pad">
            {themeList.map(([k, n]) => <div key={k} className="hbar"><span>{k}</span><div className="tr"><i style={{ width: `${(n / Math.max(1, themeList[0][1])) * 100}%`, background: "var(--indigo)" }} /></div><span className="mono tiny">{n} calls</span></div>)}
            <p className="tiny muted" style={{ marginTop: 8 }}>Each item links to a fix on the lead page. Change the prompt on the <Link href="/agent">Voice agent</Link> page, then watch whether the count falls.</p>
          </div>
        </div>
      </div>

      <section className="sec">
        <SecHead eyebrow="Phoenix protocol" title="Recovery queue — stalled enquiries worth another call" right="Callbacks are made by people; nothing here is sent automatically" />
        <div className="card tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Verdict</th><th>Customer</th><th>Stalled because</th><th>Must-say line</th><th className="r">Recovery</th><th>Call back</th></tr></thead>
            <tbody>
              {recovery.map(({ l, due }) => (
                <tr key={l.id}>
                  <td><span className="badge" style={{ background: l.intel!.phoenix!.verdict === "HIGH_PRIORITY_RECOVERY" ? "var(--terra)" : undefined, color: l.intel!.phoenix!.verdict === "HIGH_PRIORITY_RECOVERY" ? "#fff" : undefined }}>{l.intel!.phoenix!.verdict.replace(/_/g, " ").toLowerCase()}</span></td>
                  <td><Link className="rowlink" href={`/leads/${l.id}`}>{l.customerName ?? l.phoneNumber}</Link>{l.highValue && <> <span className="badge hv">HV</span></>}</td>
                  <td className="small ink2" style={{ maxWidth: 280 }}>{l.intel!.phoenix!.stallRootCause}</td>
                  <td className="small" style={{ maxWidth: 320 }}><i>{l.intel!.phoenix!.mustSayScript}</i></td>
                  <td className="r">{l.intel!.phoenix!.recoveryProbability}/10</td>
                  <td className="mono small">{due.getTime() <= Date.now() ? <span style={{ color: "var(--brick)" }}>due now</span> : fmtDate(due.toISOString(), false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {nonEnq.length > 0 && (
        <section className="sec">
          <SecHead eyebrow="Classification gate" title="Calls that weren't enquiries" right="Answered and logged; excluded from conversion so they don't dilute it" />
          <div className="card tbl-wrap"><table className="tbl"><tbody>{nonEnq.map((l) => <tr key={l.id}><td className="mono small">{fmtDate(l.enquiryAt)}</td><td><span className="badge">{l.intel!.callClass.replace(/_/g, " ").toLowerCase()}</span></td><td className="small ink2">{l.intel!.classReason}</td><td><Link className="rowlink small" href={`/leads/${l.id}`}>Open →</Link></td></tr>)}</tbody></table></div>
        </section>
      )}

      <section className="sec">
        <SecHead eyebrow="Architecture" title="Data flow — 7-stage pipeline" right="AI stages in blue, rule stages in ink" />
        <div className="pipeline">
          {STAGES.map((s) => <div key={s.n} className={s.k}><span className="st">STAGE {s.n}</span><b>{s.t}</b><span className="ink2">{s.d}</span></div>)}
        </div>
      </section>

      <div className="grid g2 sec" style={{ alignItems: "start" }}>
        <div>
          <SecHead eyebrow="Services & classes" />
          <div className="card tbl-wrap"><table className="tbl"><tbody>
            {[
              ["Vaani AI (voice agent)", "Answers the line, holds the conversation, posts the transcript + data collection."],
              ["ingestTranscript()", "Parses Vaani's transcript into turns, re-extracts every field, audits prices against pricing.md."],
              ["conversationSignals()", "Stage 4 metrics from speaker turns."],
              ["classifyCall()", "Classification gate: ENQUIRY / EXISTING_CLIENT / VENDOR_OR_OTHER."],
              ["qualify()", "The decision: explicit qualified.md rules + confidence threshold."],
              ["analyzeCall()", "CallAnalysis via Gemini 2.5 Flash structured output, heuristic fallback, retry with jitter."],
              ["opportunityScore()", "OpportunityEngine ranking score."],
              ["/api/intel/batch", "10 parallel workers, checkpoint resume, skip-on-exception."],
            ].map(([k, v]) => <tr key={k}><td className="mono small" style={{ whiteSpace: "nowrap" }}>{k}</td><td className="small ink2">{v}</td></tr>)}
          </tbody></table></div>
        </div>
        <div>
          <SecHead eyebrow="Scoring formula" />
          <div className="card card-pad">
            <pre className="arch" style={{ margin: 0 }}>{`OpportunityEngine (0–100)
score = (intent_value × 0.6)
      + (caller_talk_ratio × 100 × 0.4)

intent_value:  high → 100
               medium → 50
               low → 10`}</pre>
            <p className="small ink2" style={{ marginTop: 12 }}>The score ranks callbacks. It never changes QUALIFIED / NOT QUALIFIED. That stays with Nikhil&apos;s rules, so a chatty caller can&apos;t talk their way past a budget rule.</p>
          </div>
          <SecHead eyebrow="CallAnalysis schema" />
          <div className="card tbl-wrap"><table className="tbl"><tbody>
            {[
              ["objections", "list[ObjectionDetail] — type, strength, resolved, verbatim quote, agent response, ideal response"],
              ["swot", "Strengths, weaknesses, opportunities, threats grounded in the transcript"],
              ["deal_outcome / probability", "likely_closed · follow_up_needed · likely_lost · uncertain; 0–1"],
              ["buyer_signals", "high · medium · low"],
              ["lost_opportunity_reason", "Single biggest risk, transcript-grounded"],
              ["agent_improvement_areas", "2–4 gaps in the voice agent's behaviour + fix"],
              ["coaching_recommendations", "Actions for the design team"],
              ["phoenix_protocol", "DEAD_LEAD · NURTURE · HIGH_PRIORITY_RECOVERY, root cause, 1–10, hook, insight, must-say, wait days, decision-maker bridge"],
            ].map(([k, v]) => <tr key={k}><td className="mono small">{k}</td><td className="small ink2">{v}</td></tr>)}
          </tbody></table></div>
        </div>
      </div>

      <section className="sec">
        <SecHead eyebrow="Reliability & resilience" />
        <div className="grid g4">
          {[
            ["Rate-limit retries", "Exponential backoff + random jitter so 10 workers don't stampede the quota."],
            ["Heuristic fallback", "If the model fails or isn't configured, the deterministic analyser fills every field and says so."],
            ["Checkpoint resume", "Batch runs skip leads already analysed by AI; re-running is safe."],
            ["Skip-on-exception", "One failed lead is logged and skipped; the batch continues."],
            ["Idempotent webhooks", "Vaani retries are de-duplicated by call_id."],
            ["Guardrail audit", "Every rupee the voice agent said is checked against pricing.md after the call."],
            ["Human outcomes only", "Won/lost and value come from people; AI deal probability is labelled as a guess."],
            ["Revenue first", "Intelligence feeds the funnel; the dashboard still judges the system on projects won."],
          ].map(([t, d]) => <div key={t} className="card card-pad"><b className="small">{t}</b><p className="small ink2" style={{ margin: "6px 0 0" }}>{d}</p></div>)}
        </div>
      </section>
      <p className="tiny muted" style={{ marginTop: 24 }}>Revenue context: {won.length} won · {inrShort(won.reduce((s, l) => s + (l.projectValue ?? 0), 0))}. Adapted from the &ldquo;Call Analysis Pipeline&rdquo; architecture reference.</p>
    </div>
  );
}
