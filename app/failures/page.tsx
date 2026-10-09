import Link from "next/link";
import { loadAll } from "@/lib/data";
import { fmtDate } from "@/lib/format";
import { telegramConfigured } from "@/lib/handoff";
import { Pill, SecHead } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Failures() {
  const { metrics: m, events, overrides, leads } = await loadAll();
  const f = m.failures;
  const byId = new Map(leads.map((l) => [l.id, l]));
  const feed = events.filter((e) => e.severity !== "info" || e.type === "HUMAN_OVERRIDE").slice(0, 40);
  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">Operations</div><h1>Review &amp; failures</h1><p>Where the system is unsure, wrong, or broken. A human review queue is the AI admitting it doesn&apos;t know, which is what it should do.</p></div>
      </div>

      <div className="stack" style={{ marginBottom: 22 }}>
        {!telegramConfigured() && <div className="callout info"><b>Telegram not configured.</b> Handoffs are stored and shown, but not delivered. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in Vercel.</div>}
        {f.warnings.map((w, i) => <div key={i} className={`callout ${w.level === "error" ? "err" : ""}`}><b>{w.level === "error" ? "Alert" : "Warning"}:</b> {w.text}</div>)}
        {!f.warnings.length && <div className="callout ok">No thresholds breached.</div>}
      </div>

      <div className="grid g3">
        {Object.entries(f.counts).map(([k, v]) => (
          <div key={k} className="card stat"><div className="label">{k}</div><div className="value num" style={{ color: v ? "var(--ink)" : "var(--faint)" }}>{v}</div></div>
        ))}
      </div>
      <div className="row small muted" style={{ marginTop: 10, gap: 18 }}>
        <span>Failure rate {(f.rates.failureRate * 100).toFixed(1)}% (threshold 5%)</span>
        <span>Human–AI disagreement {f.rates.disagreementRate != null ? `${(f.rates.disagreementRate * 100).toFixed(1)}%` : "—"} (threshold 10%)</span>
        <span>Overrides {overrides.length}</span>
      </div>

      <section className="sec">
        <SecHead eyebrow="Human review queue" title={`${f.reviewQueue.length} enquiries need a person`} />
        <div className="stack">
          {f.reviewQueue.map((l) => (
            <div key={l.id} className="card card-pad">
              <div className="row between">
                <div className="row"><Link href={`/leads/${l.id}`} className="rowlink" style={{ fontFamily: "var(--serif)", fontSize: 19, textDecoration: "none" }}>{l.customerName ?? "Unknown caller"}</Link><span className="mono tiny muted">{l.phoneNumber} · {fmtDate(l.enquiryAt)}</span>{l.highValue && <span className="badge hv">high value</span>}{l.afterHours && <span className="badge ah">after hours</span>}</div>
                <div className="row"><Pill s={l.aiDecision ?? "NEW"} />{l.confidenceScore != null && <span className="mono tiny muted">conf {l.confidenceScore}</span>}</div>
              </div>
              <div className="grid g3" style={{ marginTop: 12 }}>
                <div className="small"><div className="eyebrow" style={{ marginBottom: 4 }}>Why review</div><ul style={{ margin: 0, paddingLeft: 16 }}>{l.reviewReasons.slice(0, 3).map((r) => <li key={r}>{r}</li>)}</ul></div>
                <div className="small"><div className="eyebrow" style={{ marginBottom: 4 }}>Missing</div>{l.missingFields.length ? l.missingFields.join(", ") : "Nothing — the rules couldn't decide"}<div className="eyebrow" style={{ margin: "10px 0 4px" }}>Summary</div><span className="ink2">{l.conversationSummary ?? l.qualificationReason}</span></div>
                <div className="small"><div className="eyebrow" style={{ marginBottom: 4 }}>Recommended next</div>{l.recommendedAction}<div style={{ marginTop: 10 }}><Link className="btn sm primary" href={`/leads/${l.id}`}>Decide →</Link></div></div>
              </div>
            </div>
          ))}
          {!f.reviewQueue.length && <div className="card empty-state">Queue is empty.</div>}
        </div>
      </section>

      {f.missedHandoffs.length > 0 && (
        <section className="sec">
          <SecHead eyebrow="Missed handoffs" title="Qualified, but nobody has called them" />
          <div className="card tbl-wrap"><table className="tbl"><thead><tr><th>Lead</th><th>Handoff</th><th>Assigned</th><th>Sent</th></tr></thead><tbody>
            {f.missedHandoffs.map((l) => <tr key={l.id}><td><Link className="rowlink" href={`/leads/${l.id}`}>{l.customerName ?? l.phoneNumber}</Link></td><td><Pill s={l.designerHandoffStatus} /></td><td>{l.designerAssigned}</td><td className="mono small">{fmtDate(l.handoffSentAt)}</td></tr>)}
          </tbody></table></div>
        </section>
      )}

      <section className="sec">
        <SecHead eyebrow="Event feed" title="Warnings, errors and overrides" />
        <div className="card card-pad">
          <ol className="audit">
            {feed.map((e) => { const l = e.leadId ? byId.get(e.leadId) : undefined; return (
              <li key={e.id} className={e.severity}><span className="t">{fmtDate(e.at)}</span><span className="k" /><span className="m"><b style={{ fontWeight: 600 }}>{e.type.replace(/_/g, " ").toLowerCase()}</b> — {e.message} {l && <Link href={`/leads/${l.id}`} className="actor">· {l.customerName ?? l.phoneNumber}</Link>}</span></li>
            ); })}
          </ol>
        </div>
      </section>
    </div>
  );
}
