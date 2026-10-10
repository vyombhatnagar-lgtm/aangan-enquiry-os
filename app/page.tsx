import Link from "next/link";
import { loadAll } from "@/lib/data";
import { duration, fmtDate, inr, inrShort, pct, pp } from "@/lib/format";
import { Funnel, Money, Pill } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Overview() {
  const { metrics: m, leads } = await loadAll();
  const b = m.experiment.baseline;
  const demoBase = b?.source === "DEMO_ASSUMPTION";
  const recent = leads.slice(0, 8);
  const tone = m.verdict.tone === "yes" ? "yes" : m.verdict.tone === "no" ? "no" : "";

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <div className="small muted">{m.health.enquiries} phone enquiries · updated {fmtDate(m.asOf)}</div>
        </div>
        <div className="row">
          <Link href="/leads" className="btn">All enquiries</Link>
          <Link href="/simulate" className="btn terra">Talk to agent</Link>
        </div>
      </div>

      <section className="sec">
        <div className="row" style={{ marginBottom: 12, gap: 10, flexWrap: "wrap" }}>
          <span className={`status-line ${tone}`}><b>Is it bringing in more business?</b> {m.verdict.headline}</span>
          <span className="small muted">{m.verdict.detail}</span>
        </div>
        <div className="kpis">
          <div className="card stat kpi-main">
            <div className="label">Revenue from won projects</div>
            <div className="value num">{inrShort(m.business.revenue)}</div>
            <div className="sub">{m.business.won} projects · net {inrShort(m.roi.net)} after running costs</div>
          </div>
          <div className="card stat">
            <div className="label">Enquiry → project</div>
            <div className="value num">{pct(m.business.conversion)}</div>
            <div className="sub">before: {pct(m.experiment.conversionBaseline)}{demoBase ? " (sample figure)" : ""} · {pp(m.experiment.lift)}</div>
          </div>
          <div className="card stat">
            <div className="label">Projects won</div>
            <div className="value num">{m.business.won}<span className="muted" style={{ fontSize: 18 }}>/{m.health.enquiries}</span></div>
            <div className="sub">{m.business.pendingOutcomes} qualified leads still open</div>
          </div>
          <div className="card stat">
            <div className="label">Running cost</div>
            <div className="value num">{inr(m.cost.total)}</div>
            <div className="sub">{inr(m.cost.perEnquiry, { dp: 0 })} per enquiry · {inr(m.cost.perWon, { dp: 0 })} per win</div>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="sec-head"><h2>Pipeline</h2><Link className="small" href="/analytics">Performance →</Link></div>
        <div className="card card-pad"><Funnel steps={m.funnel} /></div>
      </section>

      <section className="sec">
        <div className="grid g2">
          <div className="card card-pad">
            <h3>Response</h3>
            <table className="tbl" style={{ marginTop: 8 }}>
              <tbody>
                <tr><td>Calls answered</td><td className="r num">{m.health.answered}/{m.health.answered + m.health.failed}</td></tr>
                <tr><td>After-hours enquiries</td><td className="r num">{m.health.afterHours}</td></tr>
                <tr><td>Passed to a designer</td><td className="r num">{m.experiment.automation.handoffs}</td></tr>
                <tr><td>Median time to designer contact</td><td className="r num">{m.health.medianDesignerContactMin != null ? duration(m.health.medianDesignerContactMin * 60) : "—"}</td></tr>
                <tr><td>Qualified leads contacted within 1 hour</td><td className="r num">{pct(m.health.pctContactedWithin1h, 0)}</td></tr>
                <tr><td>Sent for manual review</td><td className="r num"><Link href="/failures">{m.health.escalations}</Link></td></tr>
              </tbody>
            </table>
          </div>
          <div className="card card-pad">
            <h3>Outcomes</h3>
            <table className="tbl" style={{ marginTop: 8 }}>
              <tbody>
                <tr><td>Consultations</td><td className="r num">{m.experiment.automation.consultations}</td></tr>
                <tr><td>Booked online</td><td className="r num">{m.health.calendlyBooked}</td></tr>
                <tr><td>Won / lost</td><td className="r num">{m.business.won} / {m.business.lost}</td></tr>
                <tr><td>Average project</td><td className="r"><Money v={m.business.avgWonValue} short /></td></tr>
                <tr><td>Revenue per enquiry</td><td className="r"><Money v={m.business.revenuePerEnquiry} short /></td></tr>
                <tr><td>Net after costs</td><td className="r"><Money v={m.roi.net} short /></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="sec-head"><h2>Latest enquiries</h2><Link className="small" href="/leads">View all →</Link></div>
        <div className="card tbl-wrap">
          <table className="tbl">
            <thead><tr><th>When</th><th>Customer</th><th>Project</th><th>Result</th><th>Stage</th><th className="r">Value</th></tr></thead>
            <tbody>
              {recent.map((l) => (
                <tr key={l.id}>
                  <td className="mono small">{fmtDate(l.enquiryAt)}</td>
                  <td><Link className="rowlink" href={`/leads/${l.id}`}>{l.customerName ?? "Unknown caller"}</Link><div className="tiny muted mono">{l.phoneNumber}</div></td>
                  <td className="small">{[l.projectType, l.bhk ? `${l.bhk} BHK` : null, l.location].filter(Boolean).join(" · ") || "—"}</td>
                  <td><Pill s={l.decision ?? "NEW"} /></td>
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
