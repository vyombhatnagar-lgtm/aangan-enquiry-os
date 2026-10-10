import type { Lead } from "@/lib/types";
import { plain } from "@/lib/format";
import { ReanalyseButton } from "./IntelActions";

export function ScoreRing({ score, size = 112, label = "opportunity" }: { score: number; size?: number; label?: string }) {
  const r = size / 2 - 9, c = 2 * Math.PI * r, off = c * (1 - score / 100);
  const col = score >= 60 ? "var(--green)" : score >= 35 ? "var(--ochre)" : "var(--red)";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label} score ${score} of 100`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--rule-2)" strokeWidth="9" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth="9" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} transform={`rotate(-90 ${size / 2} ${size / 2})`} className="ring-anim" />
      <text x="50%" y="50%" textAnchor="middle" dy="4" className="ring-num">{score}</text>
      <text x="50%" y="50%" textAnchor="middle" dy="22" className="ring-lbl">{label}</text>
    </svg>
  );
}

const STRENGTH: Record<string, string> = { weak: "var(--faint)", moderate: "var(--ochre)", strong: "var(--accent)", critical: "var(--red)" };

export function IntelPanel({ lead }: { lead: Lead }) {
  const a = lead.intel;
  if (!a) return (
    <section className="card card-pad"><div className="panel-title"><h3>Call notes</h3><ReanalyseButton leadId={lead.id} /></div><p className="small muted">Not analysed yet.</p></section>
  );
  const s = a.signals;
  const dueDate = a.phoenix && a.phoenix.waitDays > 0 ? new Date(new Date(lead.enquiryAt).getTime() + a.phoenix.waitDays * 86400000) : null;
  return (
    <section className="card card-pad intel">
      <div className="panel-title">
        <h3>Call notes</h3>
        <div className="row" style={{ gap: 8 }}><ReanalyseButton leadId={lead.id} /></div>
      </div>

      {a.callClass !== "ENQUIRY" && <div className="callout info" style={{ marginBottom: 14 }}><b>Not a new enquiry ({a.callClass === "EXISTING_CLIENT" ? "existing client" : "vendor / other"}).</b> {plain(a.classReason)}. Passed to the studio team.</div>}

      <div className="intel-top">
        <ScoreRing score={a.opportunityScore} />
        <div className="intel-kpis">
          <div><span className={`pill p-${a.buyerSignals === "high" ? "QUALIFIED" : a.buyerSignals === "low" ? "NOT_QUALIFIED" : "NEEDS_HUMAN_REVIEW"}`}>{a.buyerSignals} buyer signals</span></div>
          <div className="small"><b>{a.dealOutcome.replace(/_/g, " ")}</b> · estimated chance {Math.round(a.dealProbability * 100)}%
            <div className="meter" style={{ maxWidth: 260 }}><i style={{ width: `${a.dealProbability * 100}%`, background: "var(--accent)" }} /></div>
          </div>
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

      <div className="callout" style={{ margin: "16px 0" }}><b>Biggest risk to this project:</b> {plain(a.lostOpportunityReason)}</div>

      {a.objections.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Objections · {a.objections.filter((o) => o.resolved).length}/{a.objections.length} handled</div>
          <div className="obj-grid">
            {a.objections.map((o, i) => (
              <div key={i} className="obj">
                <div className="row between"><span className="obj-type" style={{ borderColor: STRENGTH[o.strength], color: STRENGTH[o.strength] }}>{o.type} · {o.strength}</span><span className="tiny" style={{ color: o.resolved ? "var(--green)" : "var(--red)" }}>{o.resolved ? "✓ handled" : "✗ unresolved"}</span></div>
                <blockquote>&ldquo;{o.customerQuote}&rdquo;</blockquote>
                <div className="tiny muted">What was said</div><p className="small">{o.agentResponse}</p>
                <div className="tiny" style={{ color: "var(--green)" }}>Better answer</div><p className="small">{o.idealResponse}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="eyebrow" style={{ marginBottom: 8 }}>Summary</div>
      <div className="swot">
        {(["strengths", "weaknesses", "opportunities", "threats"] as const).map((k) => (
          <div key={k} className={`sw-${k}`}><b>{k}</b>{a.swot[k].length ? <ul>{a.swot[k].map((x, i) => <li key={i}>{plain(x)}</li>)}</ul> : <p className="tiny muted">None noted</p>}</div>
        ))}
      </div>

      {a.phoenix && (
        <div className={`phoenix ph-${a.phoenix.verdict}`}>
          <div className="row between">
            <div><div className="eyebrow">Follow-up plan</div><div className="ph-verdict">{a.phoenix.verdict === "HIGH_PRIORITY_RECOVERY" ? "Call back soon" : a.phoenix.verdict === "NURTURE" ? "Keep in touch" : "Unlikely to proceed"}</div></div>
            <div style={{ textAlign: "right" }}><div className="tiny muted">chance</div><div className="num" style={{ fontSize: 30 }}>{a.phoenix.recoveryProbability}<span className="tiny muted">/10</span></div></div>
          </div>
          <p className="small ink2" style={{ margin: "6px 0 12px" }}>Why it stalled: {plain(a.phoenix.stallRootCause)}</p>
          {a.phoenix.verdict !== "DEAD_LEAD" && (
            <div className="ph-script">
              <div><span>Open with</span>{plain(a.phoenix.hearYouHook)}</div>
              <div><span>Point to make</span>{plain(a.phoenix.commercialInsight)}</div>
              <div><span>Key line</span><b>{plain(a.phoenix.mustSayScript)}</b></div>
              {a.phoenix.decisionMakerBridge !== "—" && <div><span>Decision-maker</span>{plain(a.phoenix.decisionMakerBridge)}</div>}
            </div>
          )}
          {dueDate && <div className="tiny" style={{ marginTop: 10 }}>Call back on <b>{dueDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</b> ({a.phoenix.waitDays} days after the enquiry).</div>}
        </div>
      )}

      <div className="grid g2" style={{ marginTop: 18 }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>What the call could do better</div>
          {a.agentImprovementAreas.map((x, i) => <div key={i} className="small" style={{ padding: "8px 0", borderBottom: "1px dotted var(--rule)" }}><b>{x.skill}.</b> <span className="ink2">{plain(x.observed)}</span><div style={{ color: "var(--green)" }}>→ {plain(x.fix)}</div></div>)}
        </div>
        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Tips for the designer</div>
          <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>{a.coachingRecommendations.map((x, i) => <li key={i} style={{ marginBottom: 6 }}>{plain(x)}</li>)}</ul>
        </div>
      </div>
    </section>
  );
}
