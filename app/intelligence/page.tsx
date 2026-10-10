import Link from "next/link";
import { plain } from "@/lib/format";
import { listLeads } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { SecHead, Stat, Pill } from "@/components/ui";
import { ScoreRing } from "@/components/IntelPanel";
import { BatchButton } from "@/components/IntelActions";
import type { ObjectionDetail } from "@/lib/intel/types";

export const dynamic = "force-dynamic";

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
  const won = enquiries.filter((l) => l.projectOutcome === "WON"), lost = enquiries.filter((l) => l.projectOutcome === "LOST");

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Insights</h1>
          <div className="small muted">What callers asked for, what held them back, and who to call next.</div>
        </div>
        <BatchButton />
      </div>

      <div className="grid g5" style={{ marginTop: 10 }}>
        <Stat label="Enquiry calls" value={enquiries.length} sub={`${nonEnq.length} other calls (clients, vendors)`} />
        <Stat label="Avg score · open leads" value={avg(open.map((l) => l.intel!.opportunityScore))} sub="out of 100" />
        <Stat label="Avg score · won vs lost" value={`${avg(won.map((l) => l.intel!.opportunityScore))} / ${avg(lost.map((l) => l.intel!.opportunityScore))}`} sub="check the score tracks real results" />
        <Stat label="Objections per call" value={(objs.length / Math.max(1, enquiries.length)).toFixed(1)} sub={`${objs.filter((o) => o.resolved).length}/${objs.length} handled on the call`} />
        <Stat label="Worth a callback" value={recovery.length} sub={`${recovery.filter((r) => r.l.intel!.phoenix!.verdict === "HIGH_PRIORITY_RECOVERY").length} high-priority`} />
      </div>

      <section className="sec">
        <SecHead eyebrow="Who to call first" title="Open qualified enquiries, highest score first" />
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
                  <td className="small ink2" style={{ maxWidth: 320 }}>{plain(l.intel!.lostOpportunityReason)}</td>
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
            <p className="tiny muted" style={{ marginTop: 8 }}><span style={{ color: "var(--blue)" }}>■</span> handled on the call <span style={{ color: "var(--accent)", marginLeft: 8 }}>■</span> not handled</p>
          </div>
        </div>
        <div>
          <SecHead eyebrow="Call quality" title="Where calls could go better" />
          <div className="card card-pad">
            {themeList.map(([k, n]) => <div key={k} className="hbar"><span>{k}</span><div className="tr"><i style={{ width: `${(n / Math.max(1, themeList[0][1])) * 100}%`, background: "var(--blue)" }} /></div><span className="mono tiny">{n} calls</span></div>)}
          </div>
        </div>
      </div>

      <section className="sec">
        <SecHead eyebrow="Follow-ups" title="Stalled enquiries worth another call" />
        <div className="card tbl-wrap">
          <table className="tbl">
            <thead><tr><th>Priority</th><th>Customer</th><th>Why it stalled</th><th>Suggested opener</th><th className="r">Chance</th><th>Call back</th></tr></thead>
            <tbody>
              {recovery.map(({ l, due }) => (
                <tr key={l.id}>
                  <td><span className="badge" style={{ background: l.intel!.phoenix!.verdict === "HIGH_PRIORITY_RECOVERY" ? "var(--accent)" : undefined, color: l.intel!.phoenix!.verdict === "HIGH_PRIORITY_RECOVERY" ? "#fff" : undefined }}>{l.intel!.phoenix!.verdict === "HIGH_PRIORITY_RECOVERY" ? "high" : "nurture"}</span></td>
                  <td><Link className="rowlink" href={`/leads/${l.id}`}>{l.customerName ?? l.phoneNumber}</Link>{l.highValue && <> <span className="badge hv">HV</span></>}</td>
                  <td className="small ink2" style={{ maxWidth: 280 }}>{plain(l.intel!.phoenix!.stallRootCause)}</td>
                  <td className="small" style={{ maxWidth: 320 }}><i>{plain(l.intel!.phoenix!.mustSayScript)}</i></td>
                  <td className="r">{l.intel!.phoenix!.recoveryProbability}/10</td>
                  <td className="mono small">{due.getTime() <= Date.now() ? <span style={{ color: "var(--red)" }}>due now</span> : fmtDate(due.toISOString(), false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {nonEnq.length > 0 && (
        <section className="sec">
          <SecHead eyebrow="Other calls" title="Calls that weren't new enquiries" right="Not counted in conversion" />
          <div className="card tbl-wrap"><table className="tbl"><tbody>{nonEnq.map((l) => <tr key={l.id}><td className="mono small">{fmtDate(l.enquiryAt)}</td><td><span className="badge">{l.intel!.callClass.replace(/_/g, " ").toLowerCase()}</span></td><td className="small ink2">{plain(l.intel!.classReason)}</td><td><Link className="rowlink small" href={`/leads/${l.id}`}>Open →</Link></td></tr>)}</tbody></table></div>
        </section>
      )}

    </div>
  );
}
