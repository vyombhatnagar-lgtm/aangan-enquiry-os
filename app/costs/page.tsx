import Link from "next/link";
import { loadAll } from "@/lib/data";
import { RATE_CARD } from "@/lib/costs";
import { fmtDate, inr, inrShort } from "@/lib/format";
import { SecHead, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Costs() {
  const { metrics: m, calls, leads } = await loadAll();
  const c = m.cost;
  const parts: [string, number, string][] = [["Phone minutes", c.telephony, "var(--blue)"], ["Voice (listening + speaking)", c.transcription + c.tts, "#8aa8e8"], ["AI processing", c.llm, "var(--accent)"], ["Designer notifications", c.messaging, "#b6a6f0"], ["Per-call overhead", c.other, "var(--amber)"], ["Monthly fixed costs", c.fixed, "var(--faint)"]];
  const byLead = new Map(leads.map((l) => [l.id, l]));
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Costs</h1><div className="small muted">Last {Math.round(c.periodDays)} days</div></div>
      </div>
      <div className="grid g4">
        <Stat hero label="Total cost" value={inr(c.total)} sub={`${inr(c.variable)} per call + ${inr(c.fixed)} fixed`} />
        <Stat label="Cost per enquiry" value={inr(c.perEnquiry, { dp: 2 })}  />
        <Stat label="Cost per qualified lead" value={inr(c.perQualified, { dp: 2 })}  />
        <Stat label="Cost per project won" value={inr(c.perWon)} sub={m.business.avgWonValue ? `vs ${inrShort(m.business.avgWonValue)} average project` : ""} />
      </div>
      <section className="sec">
        <SecHead eyebrow="Breakdown" right={<span className="badge demo">sample rates</span>} />
        <div className="grid g2">
          <div className="card card-pad">
            <div style={{ display: "flex", height: 26, borderRadius: 3, overflow: "hidden", marginBottom: 16 }}>{parts.map(([k, v, col]) => <div key={k} title={`${k}: ${inr(v, { dp: 2 })}`} style={{ width: `${(v / (c.total || 1)) * 100}%`, background: col }} />)}</div>
            <table className="tbl"><tbody>{parts.map(([k, v, col]) => <tr key={k}><td><span style={{ color: col }}>■</span> {k}</td><td className="r mono">{inr(v, { dp: 2 })}</td><td className="r mono muted">{((v / (c.total || 1)) * 100).toFixed(1)}%</td></tr>)}<tr className="biz"><td>Total</td><td className="r mono">{inr(c.total, { dp: 2 })}</td><td /></tr></tbody></table>
          </div>
          <div className="card card-pad">
            <div className="eyebrow" style={{ marginBottom: 10 }}>Rate card</div>
            <table className="tbl"><tbody>
              <tr><td>Phone line, per minute</td><td className="r mono">₹{RATE_CARD.telephonyPerMin}/min</td></tr>
              <tr><td>Listening, per minute</td><td className="r mono">₹{RATE_CARD.transcriptionPerMin}/min</td></tr>
              <tr><td>Speaking, per minute</td><td className="r mono">₹{RATE_CARD.ttsPerMin}/min</td></tr>
              <tr><td>Designer notification</td><td className="r mono">₹{RATE_CARD.messagingPerHandoff}</td></tr>
              <tr><td>Overhead per call</td><td className="r mono">₹{RATE_CARD.orchestrationPerCall}</td></tr>
              {Object.entries(RATE_CARD.fixedMonthly).map(([k, v]) => <tr key={k}><td>{k}</td><td className="r mono">₹{v.toLocaleString("en-IN")}/month</td></tr>)}
            </tbody></table>
            <p className="tiny muted" style={{ marginTop: 10 }}>Sample rates. Replace with the figures on your invoices.</p>
          </div>
        </div>
      </section>
      <section className="sec">
        <SecHead eyebrow="Per call" right={`${calls.length} calls · ${c.minutes.toFixed(0)} minutes`} />
        <div className="card tbl-wrap"><table className="tbl">
          <thead><tr><th>Call</th><th>Lead</th><th className="r">Min</th><th className="r">Phone</th><th className="r">Voice</th><th className="r">Processing</th><th className="r">Total</th></tr></thead>
          <tbody>{calls.map((x) => { const l = x.leadId ? byLead.get(x.leadId) : undefined; return (
            <tr key={x.id}><td className="mono tiny">{fmtDate(x.startedAt)}</td><td className="small">{l ? <Link className="rowlink" href={`/leads/${l.id}`}>{l.customerName ?? "Unknown"}</Link> : "—"}</td><td className="r mono">{x.cost.minutes.toFixed(1)}</td><td className="r mono">{x.cost.telephony.toFixed(2)}</td><td className="r mono">{(x.cost.transcription + x.cost.tts).toFixed(2)}</td><td className="r mono">{(x.cost.llm + x.cost.other + x.cost.messaging).toFixed(2)}</td><td className="r mono">₹{x.cost.total.toFixed(2)}</td></tr>); })}</tbody>
        </table></div>
      </section>
    </div>
  );
}
