import { loadAll } from "@/lib/data";
import { inr, inrShort, pct, pp } from "@/lib/format";
import { Funnel, SecHead, Stat } from "@/components/ui";
import { BaselineForm } from "@/components/BaselineForm";

export const dynamic = "force-dynamic";

function Change({ a, b, money, rate }: { a: number | null; b: number | null; money?: boolean; rate?: boolean }) {
  if (a == null || b == null) return <span className="muted">—</span>;
  const d = b - a;
  const col = d > 0 ? "var(--sage)" : d < 0 ? "var(--brick)" : "var(--muted)";
  return <span style={{ color: col }} className="mono">{rate ? pp(d) : money ? `${d >= 0 ? "+" : "−"}${inrShort(Math.abs(d)).replace("₹", "₹")}` : `${d >= 0 ? "+" : ""}${d.toFixed(0)}`}</span>;
}

export default async function Analytics() {
  const { metrics: m } = await loadAll();
  const b = m.experiment.baseline;
  const a = m.experiment.automation;
  const N = a.enquiries;
  const demo = b?.source === "DEMO_ASSUMPTION";
  const r = (x: number, n: number) => (n ? x / n : null);
  const bRate = (k: "responded5min" | "qualified" | "handoffs" | "consultations" | "won") => (b ? r(b[k], b.enquiries) : null);
  const bRoi = null; // the manual process has no automation cost line
  const curRoi = m.roi.incremental?.roiPct ?? null;
  const maxW = Math.max(...m.weekly.map((w) => w.enquiries), 1);

  const rows: { k: string; label: string; base: React.ReactNode; cur: React.ReactNode; change: React.ReactNode; biz?: boolean }[] = [
    { k: "enq", label: "Enquiries", base: b?.enquiries ?? "—", cur: N, change: <span className="muted tiny">different period lengths — compare rates</span> },
    { k: "r5", label: "Response < 5 min", base: pct(bRate("responded5min")), cur: pct(r(a.within5, N)), change: <Change a={bRate("responded5min")} b={r(a.within5, N)} rate /> },
    { k: "q", label: "Qualified", base: pct(bRate("qualified")), cur: pct(r(a.qualified, N)), change: <Change a={bRate("qualified")} b={r(a.qualified, N)} rate /> },
    { k: "h", label: "Designer handoff", base: pct(bRate("handoffs")), cur: pct(r(a.handoffs, N)), change: <Change a={bRate("handoffs")} b={r(a.handoffs, N)} rate /> },
    { k: "c", label: "Consultation", base: pct(bRate("consultations")), cur: pct(r(a.consultations, N)), change: <Change a={bRate("consultations")} b={r(a.consultations, N)} rate />, biz: true },
    { k: "w", label: "Projects won", base: b?.won ?? "—", cur: a.won, change: <span className="muted tiny">see conversion</span>, biz: true },
    { k: "conv", label: "Conversion (won ÷ enquiries)", base: pct(m.experiment.conversionBaseline), cur: pct(m.experiment.conversionAutomation), change: <Change a={m.experiment.conversionBaseline} b={m.experiment.conversionAutomation} rate />, biz: true },
    { k: "rev", label: "Revenue per enquiry", base: b ? inrShort(b.revenue / b.enquiries) : "—", cur: inrShort(m.business.revenuePerEnquiry), change: <Change a={b ? b.revenue / b.enquiries : null} b={m.business.revenuePerEnquiry} money />, biz: true },
    { k: "revT", label: "Revenue (period total)", base: b ? inrShort(b.revenue) : "—", cur: inrShort(m.business.revenue), change: <span className="muted tiny">period totals</span>, biz: true },
    { k: "cost", label: "Automation cost", base: "₹0 (2 front-desk staff)", cur: inr(m.cost.total), change: <span className="mono" style={{ color: "var(--brick)" }}>+{inr(m.cost.total)}</span> },
    { k: "roi", label: "Incremental ROI", base: bRoi ?? "n/a", cur: curRoi != null ? `${Math.round(curRoi).toLocaleString("en-IN")}%` : "—", change: <span className="tiny" style={{ color: "var(--ochre)" }}>{m.roi.status === "CAUSAL" ? "causal" : "not causal"}</span>, biz: true },
  ];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Business</div>
          <h1>Analytics & ROI</h1>
          <p>The test is not &ldquo;did the AI answer calls&rdquo; but &ldquo;did more enquiries become projects&rdquo;. Business rows are highlighted; everything else is supporting evidence.</p>
        </div>
      </div>

      <div className={`callout ${m.roi.status === "CAUSAL" ? "ok" : ""}`} style={{ marginBottom: 22 }}><b>{m.roi.status === "CAUSAL" ? "Causal evidence." : "ROI cannot yet be causally established."}</b> {m.roi.statusText.replace(/^ROI cannot yet be causally established — /, "")}</div>

      <div className="grid g4">
        <Stat hero cls="terra" tag="lag" label="Project conversion" value={pct(m.business.conversion)} sub={`${m.business.won} won ÷ ${N} enquiries`} />
        <Stat hero cls="terra" tag="lag" label="Revenue generated" value={inrShort(m.business.revenue)} sub="Σ value of won projects" />
        <Stat cls="terra" tag="lag" label="Revenue per enquiry" value={inrShort(m.business.revenuePerEnquiry)} />
        <Stat cls="terra" tag="lag" label="Revenue per qualified lead" value={inrShort(m.business.revenuePerQualified)} />
      </div>

      <section className="sec">
        <SecHead eyebrow="Baseline vs automation" title="Did anything change?" right={b ? <>{b.label} · {b.period} · <span className={demo ? "badge demo" : "badge"}>{demo ? "DEMO ASSUMPTION" : "entered"}</span></> : "no baseline"} />
        <div className="card tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Metric</th><th className="r">Baseline</th><th className="r">Current (AI-assisted)</th><th className="r">Change</th></tr></thead>
            <tbody>{rows.map((x) => <tr key={x.k} className={x.biz ? "biz" : ""}><td>{x.label}</td><td className="r">{x.base}</td><td className="r">{x.cur}</td><td className="r">{x.change}</td></tr>)}</tbody>
          </table>
        </div>
        {demo && <p className="tiny muted" style={{ marginTop: 8 }}>{b?.notes}</p>}
      </section>

      <section className="sec">
        <SecHead eyebrow="Funnel" title="Conversion and drop-off by stage" />
        <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)" }}>
          <div className="card card-pad"><Funnel steps={m.funnel} /></div>
          <div className="card tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Stage</th><th className="r">Count</th><th className="r">Of prev.</th><th className="r">Drop-off</th><th className="r">Of all</th></tr></thead>
              <tbody>{m.funnel.map((s) => <tr key={s.key}><td>{s.label}</td><td className="r">{s.count}</td><td className="r">{pct(s.fromPrev, 0)}</td><td className="r">{pct(s.dropoff, 0)}</td><td className="r">{pct(s.fromTop, 0)}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="sec">
        <SecHead eyebrow="ROI" title="Revenue − cost, done honestly" />
        <div className="grid g2">
          <div className="card card-pad ledger" style={{ borderLeft: 0 }}>
            <div className="eyebrow">Gross (all revenue through the system)</div>
            <table style={{ marginTop: 10 }}>
              <tbody>
                <tr><td>Revenue generated</td><td>{inr(m.business.revenue)}</td></tr>
                <tr><td>− Automation cost</td><td>−{inr(m.cost.total)}</td></tr>
                <tr className="total"><td>Net value</td><td>{inr(m.roi.net)}</td></tr>
                <tr><td>ROI = net ÷ cost × 100</td><td>{m.roi.grossRoiPct != null ? `${Math.round(m.roi.grossRoiPct).toLocaleString("en-IN")}%` : "—"}</td></tr>
              </tbody>
            </table>
            <p className="tiny muted" style={{ marginTop: 10 }}>Counts every won project, including ones the front desk would have won anyway. That&apos;s why this number is large and why it proves nothing on its own.</p>
          </div>
          <div className="card card-pad ledger" style={{ borderLeft: 0 }}>
            <div className="eyebrow">Incremental (only the lift over baseline)</div>
            {m.roi.incremental ? (
              <table style={{ marginTop: 10 }}>
                <tbody>
                  <tr><td>Conversion lift</td><td>{pp(m.roi.incremental.liftPP)}</td></tr>
                  <tr><td>× {N} enquiries = extra projects</td><td>{m.roi.incremental.extraProjects.toFixed(1)}</td></tr>
                  <tr><td>× avg won value = incremental revenue</td><td>{inr(Math.round(m.roi.incremental.extraRevenue))}</td></tr>
                  <tr><td>− Automation cost</td><td>−{inr(m.cost.total)}</td></tr>
                  <tr className="total"><td>Incremental net value</td><td>{inr(Math.round(m.roi.incremental.netIncremental))}</td></tr>
                  <tr><td>Incremental ROI</td><td>{m.roi.incremental.roiPct != null ? `${Math.round(m.roi.incremental.roiPct).toLocaleString("en-IN")}%` : "—"}</td></tr>
                </tbody>
              </table>
            ) : <p className="small muted">Needs a baseline. Enter one below.</p>}
            <p className="tiny" style={{ marginTop: 10, color: "var(--ochre)" }}>{demo ? "Illustrative only — calculated against a demo baseline." : m.roi.statusText}</p>
          </div>
        </div>
      </section>

      <section className="sec" id="experiment">
        <SecHead eyebrow="Experiment / validation" title="Faster, better-qualified handling → more projects?" />
        <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>
          <div className="card card-pad">
            <div className="eyebrow" style={{ marginBottom: 8 }}>Hypothesis</div>
            <p style={{ fontFamily: "var(--serif)", fontSize: 19, fontStyle: "italic", margin: "0 0 16px" }}>Faster and better-qualified inbound enquiry handling increases enquiry-to-project conversion.</p>
            <table className="tbl">
              <thead><tr><th /><th className="r">Baseline cohort</th><th className="r">Automation cohort</th></tr></thead>
              <tbody>
                <tr><td>Enquiries</td><td className="r">{b?.enquiries ?? "—"}</td><td className="r">{N}</td></tr>
                <tr><td>Response &lt; 5 min</td><td className="r">{pct(bRate("responded5min"), 0)}</td><td className="r">{pct(r(a.within5, N), 0)}</td></tr>
                <tr><td>Qualified</td><td className="r">{pct(bRate("qualified"), 0)}</td><td className="r">{pct(r(a.qualified, N), 0)}</td></tr>
                <tr><td>Consultation</td><td className="r">{pct(bRate("consultations"), 0)}</td><td className="r">{pct(r(a.consultations, N), 0)}</td></tr>
                <tr className="biz"><td>Project conversion</td><td className="r">{pct(m.experiment.conversionBaseline)}</td><td className="r">{pct(m.experiment.conversionAutomation)}</td></tr>
                <tr className="biz"><td>Revenue per enquiry</td><td className="r">{b ? inrShort(b.revenue / b.enquiries) : "—"}</td><td className="r">{inrShort(m.business.revenuePerEnquiry)}</td></tr>
              </tbody>
            </table>
          </div>
          <div className="card card-pad">
            <div className="grid g2">
              <Stat label="Conversion lift" value={pp(m.experiment.lift)} sub="automation − baseline" />
              <Stat label="Relative lift" value={m.experiment.relLift != null ? `${(m.experiment.relLift * 100).toFixed(0)}%` : "—"} sub="(auto − base) ÷ base" />
              <Stat label="p-value" value={m.experiment.pValue != null ? m.experiment.pValue.toFixed(4) : "—"} sub="two-proportion z-test" />
              <Stat label="Sample needed / arm" value={m.experiment.minSamplePerArm ?? "—"} sub="α 0.05, power 0.8, at this lift" />
            </div>
            <div className="callout" style={{ marginTop: 14 }}>
              <b>Can we claim causality?</b> {m.roi.status === "CAUSAL" ? "Yes — randomised, significant, real baseline." : <>No. {demo ? "The baseline is invented for the demo. " : ""}{b?.design !== "RANDOMISED" ? "A before/after comparison can't separate the AI's effect from seasonality (Diwali), marketing, or pricing changes. " : ""}A small p-value here only says the two rates differ, not why.</>}
            </div>
            <div className="small ink2" style={{ marginTop: 12 }}>
              <b>To make it causal:</b> route calls by alternate days (or even/odd caller numbers) — one arm to the AI line, one to the front desk — for 6–8 weeks, record outcomes for both the same way, then mark the baseline &ldquo;Randomised&rdquo;. Judge only enquiries at least {m.business.matured.days} days old; younger ones haven&apos;t had time to convert.
            </div>
          </div>
        </div>
      </section>

      <section className="sec">
        <SecHead eyebrow="Weekly" title="Enquiries and wins by week" right={<><span style={{ color: "var(--indigo)" }}>■</span> enquiries <span style={{ color: "var(--terra)", marginLeft: 8 }}>■</span> won</>} />
        <div className="card card-pad">
          <div className="bars">
            {m.weekly.map((w) => (
              <div key={w.week} className="b" title={`${w.week}: ${w.enquiries} enquiries, ${w.won} won, ${inr(w.revenue)}`}>
                <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 100 }}>
                  <i style={{ flex: 1, height: `${(w.enquiries / maxW) * 100}%` }} />
                  <i className="w" style={{ flex: 1, height: `${(w.won / maxW) * 100}%` }} />
                </div>
                <span>{w.week.slice(5)}</span>
              </div>
            ))}
          </div>
          <p className="tiny muted" style={{ marginTop: 8 }}>Recent weeks show fewer wins partly because those enquiries haven&apos;t had time to convert. Don&apos;t read the right edge as a decline.</p>
        </div>
      </section>

      <section className="sec">
        <SecHead eyebrow="Baseline" title="Enter the real manual-process numbers" right="Without this, the dashboard cannot answer the question" />
        <div className="card card-pad"><BaselineForm b={b} /></div>
      </section>
    </div>
  );
}
