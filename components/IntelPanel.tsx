import type { Lead } from "@/lib/types";
import { ReanalyseButton } from "./IntelActions";

export function ScoreRing({ score, size = 112, label = "opportunity" }: { score: number; size?: number; label?: string }) {
  const r = size / 2 - 9, c = 2 * Math.PI * r, off = c * (1 - score / 100);
  const col = score >= 60 ? "var(--sage)" : score >= 35 ? "var(--ochre)" : "var(--brick)";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label} score ${score} of 100`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--rule-2)" strokeWidth="9" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth="9" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} transform={`rotate(-90 ${size / 2} ${size / 2})`} className="ring-anim" />
      <text x="50%" y="50%" textAnchor="middle" dy="4" className="ring-num">{score}</text>
      <text x="50%" y="50%" textAnchor="middle" dy="22" className="ring-lbl">{label}</text>
    </svg>
  );
}

const STRENGTH: Record<string, string> = { weak: "var(--faint)", moderate: "var(--ochre)", strong: "var(--terra)", critical: "var(--brick)" };

export function IntelPanel({ lead }: { lead: Lead }) {
  const a = lead.intel;
  if (!a) return (
    <section className="card card-pad"><div className="panel-title"><h3>Call intelligence</h3><ReanalyseButton leadId={lead.id} /></div><p className="small muted">Not analysed yet.</p></section>
  );
  const s = a.signals;
  const dueDate = a.phoenix && a.phoenix.waitDays > 0 ? new Date(new Date(lead.enquiryAt).getTime() + a.phoenix.waitDays * 86400000) : null;
  return (
    <section className="card card-pad intel">
      <div className="panel-title">
        <div><div className="eyebrow">Call intelligence layer</div><h3 style={{ marginTop: 2 }}>What this call tells the design team</h3></div>
        <div className="row" style={{ gap: 8 }}><span className="badge">{a.engine.startsWith("heuristic") ? a.engine : `AI · ${a.engine}`}</span><ReanalyseButton leadId={lead.id} /></div>
      </div>

      {a.callClass !== "ENQUIRY" && <div className="callout info" style={{ marginBottom: 14 }}><b>Classification gate: {a.callClass.replace(/_/g, " ").toLowerCase()}.</b> {a.classReason}. Routed to the studio team and kept out of the enquiry funnel.</div>}

      <div className="intel-top">
        <ScoreRing score={a.opportunityScore} />
        <div className="intel-kpis">
          <div><span className={`pill p-${a.buyerSignals === "high" ? "QUALIFIED" : a.buyerSignals === "low" ? "NOT_QUALIFIED" : "NEEDS_HUMAN_REVIEW"}`}>{a.buyerSignals} buyer signals</span></div>
          <div className="small"><b>{a.dealOutcome.replace(/_/g, " ")}</b> · deal probability {Math.round(a.dealProbability * 100)}%
            <div className="meter" style={{ maxWidth: 260 }}><i style={{ width: `${a.dealProbability * 100}%`, background: "var(--terra)" }} /></div>
          </div>
          <div className="tiny muted mono">OpportunityEngine = intent × 0.6 + caller talk ratio × 100 × 0.4 · a ranking aid, not the qualification decision</div>
        </div>
        <div className="intel-signals">
          <div className="tiny muted" style={{ marginBottom: 4 }}>Talk ratio</div>
          <div className="talkbar"><i style={{ width: `${s.callerTalkRatio * 100}%` }} /><span>caller {Math.round(s.callerTalkRatio * 100)}%</span><span>agent {Math.round(s.agentTalkRatio * 100)}%</span></div>
          <dl className="kv small" style={{ marginTop: 10, gridTemplateColumns: "140px 1fr" }}>
            <dt>Caller questions</dt><dd>{s.callerQuestions}</dd>
            <dt>Avg caller words</dt><dd>{s.avgCallerWords}</dd>
            <dt>Price mentions</dt><dd>{s.priceMentions}</dd>
            <dt>Hesitations</dt><dd>{s.hesitations}</dd>
          </dl>
        </div>
      </div>

      <div className="callout" style={{ margin: "16px 0" }}><b>Biggest risk to this project:</b> {a.lostOpportunityReason}</div>

      {a.objections.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Objections · {a.objections.filter((o) => o.resolved).length}/{a.objections.length} handled</div>
          <div className="obj-grid">
            {a.objections.map((o, i) => (
              <div key={i} className="obj">
                <div className="row between"><span className="obj-type" style={{ borderColor: STRENGTH[o.strength], color: STRENGTH[o.strength] }}>{o.type} · {o.strength}</span><span className="tiny" style={{ color: o.resolved ? "var(--sage)" : "var(--brick)" }}>{o.resolved ? "✓ handled" : "✗ unresolved"}</span></div>
                <blockquote>&ldquo;{o.customerQuote}&rdquo;</blockquote>
                <div className="tiny muted">Agent said</div><p className="small">{o.agentResponse}</p>
                <div className="tiny" style={{ color: "var(--sage)" }}>Better answer</div><p className="small">{o.idealResponse}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="eyebrow" style={{ marginBottom: 8 }}>SWOT · grounded in this call</div>
      <div className="swot">
        {(["strengths", "weaknesses", "opportunities", "threats"] as const).map((k) => (
          <div key={k} className={`sw-${k}`}><b>{k}</b>{a.swot[k].length ? <ul>{a.swot[k].map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="tiny muted">None noted</p>}</div>
        ))}
      </div>

      {a.phoenix && (
        <div className={`phoenix ph-${a.phoenix.verdict}`}>
          <div className="row between">
            <div><div className="eyebrow">Phoenix protocol · lead recovery</div><div className="ph-verdict">{a.phoenix.verdict.replace(/_/g, " ")}</div></div>
            <div style={{ textAlign: "right" }}><div className="tiny muted">recovery probability</div><div className="num" style={{ fontSize: 30 }}>{a.phoenix.recoveryProbability}<span className="tiny muted">/10</span></div></div>
          </div>
          <p className="small ink2" style={{ margin: "6px 0 12px" }}>Stalled because: {a.phoenix.stallRootCause}</p>
          {a.phoenix.verdict !== "DEAD_LEAD" && (
            <div className="ph-script">
              <div><span>Hear-you hook</span>{a.phoenix.hearYouHook}</div>
              <div><span>Insight</span>{a.phoenix.commercialInsight}</div>
              <div><span>Must say</span><b>{a.phoenix.mustSayScript}</b></div>
              {a.phoenix.decisionMakerBridge !== "—" && <div><span>Decision-maker</span>{a.phoenix.decisionMakerBridge}</div>}
            </div>
          )}
          {dueDate && <div className="tiny" style={{ marginTop: 10 }}>Call back on <b>{dueDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</b> ({a.phoenix.waitDays} days after the enquiry) — by a person, not automated.</div>}
        </div>
      )}

      <div className="grid g2" style={{ marginTop: 18 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Voice agent improvements</div>
          {a.agentImprovementAreas.map((x, i) => <div key={i} className="small" style={{ padding: "8px 0", borderBottom: "1px dotted var(--rule)" }}><b>{x.skill}.</b> <span className="ink2">{x.observed}</span><div style={{ color: "var(--sage)" }}>→ {x.fix}</div></div>)}
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Coaching · design team</div>
          <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>{a.coachingRecommendations.map((x, i) => <li key={i} style={{ marginBottom: 6 }}>{x}</li>)}</ul>
        </div>
      </div>
    </section>
  );
}
