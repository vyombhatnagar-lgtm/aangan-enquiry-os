import Link from "next/link";
import { loadAll } from "@/lib/data";
import { duration, fmtDate, inr, inrShort, pct, pp } from "@/lib/format";
import { Money, Pill, SecHead, Stat } from "@/components/ui";
import { Stepwell } from "@/components/Stepwell";
import { CountUp } from "@/components/CountUp";

export const dynamic = "force-dynamic";

export default async function Overview() {
  const { metrics: m, leads } = await loadAll();
  const b = m.experiment.baseline;
  const inc = m.roi.incremental;
  const demoBase = b?.source === "DEMO_ASSUMPTION";
  const recent = leads.slice(0, 8);
  const maxConv = Math.max(m.business.conversion, m.experiment.conversionBaseline ?? 0, 0.01);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Overview · {fmtDate(m.asOf)} IST · {m.health.enquiries} phone enquiries since {fmtDate(leads.at(-1)?.enquiryAt, false)}</div>
        </div>
        <div className="row">
          <Link href="/simulate" className="btn terra">Simulate incoming call</Link>
          <Link href="/analytics" className="btn">Full analytics</Link>
        </div>
      </div>

      {/* —— the one question —— */}
      <section className={`nc tone-${m.verdict.tone}`}>
        <svg className="hero-jaali" aria-hidden viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice">
          <defs>
            <pattern id="jaali" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M20 0 L40 20 L20 40 L0 20 Z" fill="none" stroke="currentColor" strokeWidth=".8" />
              <circle cx="20" cy="20" r="6" fill="none" stroke="currentColor" strokeWidth=".8" />
              <circle cx="0" cy="0" r="3" fill="currentColor" /><circle cx="40" cy="40" r="3" fill="currentColor" />
            </pattern>
          </defs>
          <rect width="400" height="400" fill="url(#jaali)" />
        </svg>
        <div className="hero-arch">
          <svg viewBox="0 0 300 380" aria-hidden className="arch-svg">
            <path d="M10 380 V170 C10 80 80 22 150 6 C220 22 290 80 290 170 V380" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M30 380 V176 C30 98 92 46 150 30 C208 46 270 98 270 176 V380" fill="none" stroke="currentColor" strokeWidth=".8" opacity=".6" />
          </svg>
          <div className="hero-q">
            <div className="ask">Is this system generating more business?</div>
            <div className="answer">{m.verdict.headline}</div>
            <div className="detail">{m.verdict.detail}</div>
          </div>
        </div>
        <div className="hero-ledger">
          <div className="hl-k">Revenue from won projects <span className="indicator-tag tag-lag">human-recorded</span></div>
          <div className="hl-big num"><CountUp value={m.business.revenue} format="inrShort" /></div>
          <div className="hl-grid">
            <div><span className="num"><CountUp value={m.business.conversion} format="pct" /></span><small>enquiry → project</small></div>
            <div><span className="num">{m.business.won}<em>/{m.health.enquiries}</em></span><small>projects won</small></div>
            <div><span className="num"><CountUp value={m.experiment.lift ?? 0} format="pp" /></span><small>vs baseline{demoBase ? " (demo)" : ""}</small></div>
          </div>
          <table>
            <tbody>
              <tr><td>Revenue</td><td>{inr(m.business.revenue)}</td></tr>
              <tr><td>− Automation cost <span className="note">per-call {inr(m.cost.variable)} + fixed {inr(m.cost.fixed)}</span></td><td>−{inr(m.cost.total)}</td></tr>
              <tr className="total"><td>Net value</td><td>{inr(m.roi.net)}</td></tr>
              <tr><td>Incremental vs baseline <span className="note">{demoBase ? "illustrative — demo baseline" : b ? "before/after estimate" : "needs a baseline"}</span></td><td>{inc ? inrShort(inc.extraRevenue) : "—"}</td></tr>
            </tbody>
          </table>
          <div className="hero-caveat">⚠ {m.roi.statusText}</div>
        </div>
      </section>

      {/* —— level 3: business outcome —— */}
      <section className="sec">
        <SecHead eyebrow="Level 3 · Business outcome" title="Conversion and revenue" right={<>{m.business.pendingOutcomes} qualified enquiries still have no outcome — revenue lags the call by weeks</>} />
        <div className="grid g4">
          <Stat hero cls="terra" tag="lag" label="Enquiry → project conversion" value={pct(m.business.conversion)} sub={<>Won ÷ all enquiries · baseline {pct(m.experiment.conversionBaseline)}{demoBase ? " (demo)" : ""}</>} />
          <Stat cls="terra" tag="lag" label="Revenue per enquiry" value={inrShort(m.business.revenuePerEnquiry)} sub="Revenue ÷ total enquiries" />
          <Stat cls="terra" tag="lag" label="Revenue per qualified lead" value={inrShort(m.business.revenuePerQualified)} sub="Revenue ÷ qualified leads" />
          <Stat cls="terra" tag="lag" label="Conversion lift" value={pp(m.experiment.lift)} sub={m.experiment.relLift != null ? <>{(m.experiment.relLift * 100).toFixed(0)}% relative · p = {m.experiment.pValue?.toFixed(4) ?? "—"} · {demoBase ? "demo baseline" : "before/after"}</> : "needs a baseline"} />
        </div>
        <div className="card card-pad" style={{ marginTop: 16 }}>
          <div className="row between" style={{ marginBottom: 12 }}>
            <div className="eyebrow">Enquiry → project, baseline vs now</div>
            <div className="tiny muted">Matured cohort (enquiries ≥ {m.business.matured.days} days old): {m.business.matured.won}/{m.business.matured.enquiries} = {pct(m.business.matured.conversion)}</div>
          </div>
          <div className="compare">
            <div className="cmp-row"><span className="muted">Baseline{demoBase ? " (demo)" : ""}</span><div className="cmp-bar"><i style={{ width: `${((m.experiment.conversionBaseline ?? 0) / maxConv) * 100}%`, background: "var(--faint)" }} /></div><span className="num" style={{ fontSize: 18 }}>{pct(m.experiment.conversionBaseline)}</span></div>
            <div className="cmp-row"><span>AI-assisted</span><div className="cmp-bar"><i style={{ width: `${(m.business.conversion / maxConv) * 100}%`, background: "var(--terra)" }} /></div><span className="num" style={{ fontSize: 18 }}>{pct(m.business.conversion)}</span></div>
          </div>
        </div>
      </section>

      {/* —— level 2: funnel —— */}
      <section className="sec">
        <SecHead eyebrow="Level 2 · Funnel" title="The stepwell: only what reaches the water is revenue" right={<Link href="/analytics">Conversion by stage →</Link>} />
        <div className="card card-pad stepwell-card"><Stepwell steps={m.funnel} revenue={m.business.revenue} won={m.business.won} /></div>
      </section>

      {/* —— leading vs lagging —— */}
      <section className="sec">
        <SecHead eyebrow="Read these together" title="Leading indicators are not revenue" />
        <div className="grid g2">
          <div className="card card-pad">
            <div className="row between"><h3>Leading</h3><span className="indicator-tag tag-lead">evidence, not proof</span></div>
            <p className="small ink2" style={{ marginTop: 6 }}>These move the day the system goes live. They can all look perfect while revenue stays flat.</p>
            <table className="tbl" style={{ marginTop: 8 }}>
              <tbody>
                <tr><td>Answered within 5 minutes</td><td className="r num">{pct(m.health.pctWithin5min, 0)}</td></tr>
                <tr><td>Median handoff → designer contact</td><td className="r num">{m.health.medianDesignerContactMin != null ? duration(m.health.medianDesignerContactMin * 60) : "—"}</td></tr>
                <tr><td>Qualified leads contacted within 1 hour</td><td className="r num">{pct(m.health.pctContactedWithin1h, 0)}</td></tr>
                <tr><td>Qualification complete (no missing fields)</td><td className="r num">{pct(m.health.qualCompletion, 0)}</td></tr>
                <tr><td>Handoffs sent</td><td className="r num">{m.experiment.automation.handoffs}</td></tr>
                <tr><td>Consultations booked via Calendly</td><td className="r num">{m.health.calendlyBooked} <span className="tiny muted">({pct(m.health.calendlyShare, 0)} of bookings)</span></td></tr>
                <tr><td>Median handoff → Calendly booking</td><td className="r num">{m.health.medianHandoffToBookingH != null ? duration(m.health.medianHandoffToBookingH * 3600) : "—"}</td></tr>
              </tbody>
            </table>
          </div>
          <div className="card card-pad">
            <div className="row between"><h3>Lagging</h3><span className="indicator-tag tag-lag">what pays</span></div>
            <p className="small ink2" style={{ marginTop: 6 }}>These arrive weeks later and only when a person records them. This is the scorecard.</p>
            <table className="tbl" style={{ marginTop: 8 }}>
              <tbody>
                <tr><td>Consultations</td><td className="r num">{m.experiment.automation.consultations}</td></tr>
                <tr><td>Projects won / lost</td><td className="r num">{m.business.won} / {m.business.lost}</td></tr>
                <tr><td>Project conversion</td><td className="r num">{pct(m.business.conversion)}</td></tr>
                <tr><td>Average won project</td><td className="r"><Money v={m.business.avgWonValue} short /></td></tr>
                <tr><td>Net value after automation cost</td><td className="r"><Money v={m.roi.net} short /></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* —— level 1: automation health —— */}
      <section className="sec">
        <SecHead eyebrow="Level 1 · Automation health" right={<Link href="/failures">Failures & review queue →</Link>} />
        <div className="grid g4">
          <Stat cls="indigo" tag="lead" label="Total enquiries" value={m.health.enquiries} sub={`${m.health.afterHours} after hours (${pct(m.health.enquiries ? m.health.afterHours / m.health.enquiries : 0, 0)})`} />
          <Stat cls="indigo" tag="lead" label="Calls answered" value={`${m.health.answered}/${m.health.answered + m.health.failed}`} sub={`${m.health.failed} failed or abandoned`} />
          <Stat cls="indigo" tag="lead" label="Avg time to answer" value={m.health.avgAnswerSec != null ? `${m.health.avgAnswerSec.toFixed(1)}s` : "—"} sub={`${pct(m.health.pctWithin5min, 0)} answered within 5 min`} />
          <Stat cls="indigo" tag="lead" label="Human escalations" value={m.health.escalations} sub="AI chose NEEDS_HUMAN_REVIEW" />
        </div>
      </section>

      <section className="sec">
        <SecHead eyebrow="Cost" right={<Link href="/costs">Cost breakdown →</Link>} />
        <div className="grid g4">
          <Stat label="Total automation cost" value={inr(m.cost.total)} sub={`${inr(m.cost.variable)} per-call + ${inr(m.cost.fixed)} fixed · ${m.cost.minutes.toFixed(0)} min`} />
          <Stat label="Cost per enquiry" value={inr(m.cost.perEnquiry, { dp: 2 })} />
          <Stat label="Cost per qualified lead" value={inr(m.cost.perQualified, { dp: 2 })} />
          <Stat label="Cost per project won" value={inr(m.cost.perWon, { dp: 0 })} sub="vs average project value" />
        </div>
      </section>

      <section className="sec">
        <SecHead eyebrow="Latest enquiries" right={<Link href="/leads">All enquiries →</Link>} />
        <div className="card tbl-wrap">
          <table className="tbl">
            <thead><tr><th>When</th><th>Customer</th><th>Project</th><th>AI decision</th><th>Stage</th><th className="r">Value</th></tr></thead>
            <tbody>
              {recent.map((l) => (
                <tr key={l.id}>
                  <td className="mono">{fmtDate(l.enquiryAt)}{l.afterHours && <> <span className="badge ah">after hours</span></>}</td>
                  <td><Link className="rowlink" href={`/leads/${l.id}`}>{l.customerName ?? "Unknown caller"}</Link><div className="tiny muted mono">{l.phoneNumber}</div></td>
                  <td className="small">{[l.projectType, l.bhk ? `${l.bhk} BHK` : null, l.location].filter(Boolean).join(" · ") || "—"}</td>
                  <td><Pill s={l.aiDecision ?? "NEW"} />{l.decision !== l.aiDecision && l.aiDecision && <div className="tiny muted" style={{ marginTop: 4 }}>overridden → {l.decision?.toLowerCase().replace(/_/g, " ")}</div>}</td>
                  <td><Pill s={l.status} /></td>
                  <td className="r"><Money v={l.projectValue} short /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
