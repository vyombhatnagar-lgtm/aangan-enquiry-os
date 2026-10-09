import Link from "next/link";
import { listCalls, listLeads } from "@/lib/db";
import { duration, fmtDate, inr } from "@/lib/format";
import { Pill } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CallsPage() {
  const [calls, leads] = await Promise.all([listCalls(), listLeads()]);
  const byId = new Map(leads.map((l) => [l.id, l]));
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Operations</div>
          <h1>Calls</h1>
          <p>Every call and its full transcript, kept in Postgres. Nothing exists only in Telegram or in the telephony provider.</p>
        </div>
      </div>
      <div className="stack">
        {calls.map((c) => {
          const l = c.leadId ? byId.get(c.leadId) : undefined;
          return (
            <details key={c.id} className="card collapse">
              <summary className="card-pad" style={{ display: "grid", gridTemplateColumns: "150px minmax(0,1fr) 110px 110px 90px", gap: 14, alignItems: "center" }}>
                <span className="mono small">{fmtDate(c.startedAt)}{c.afterHours && <div><span className="badge ah">after hours</span></div>}</span>
                <span>
                  <b style={{ fontWeight: 500 }}>{l?.customerName ?? "Unknown caller"}</b> <span className="tiny muted mono">{c.phone}</span>
                  <div className="tiny muted" style={{ marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.transcript.find((t) => t.speaker === "caller")?.text ?? c.failureReason ?? ""}</div>
                </span>
                <Pill s={c.status} />
                <span>{l?.aiDecision ? <Pill s={l.aiDecision} /> : <span className="tiny muted">—</span>}</span>
                <span className="r mono small" style={{ textAlign: "right" }}>{duration(c.durationSec)}<div className="tiny muted">{inr(c.cost.total, { dp: 2 })}</div></span>
              </summary>
              <div style={{ padding: "0 24px 22px" }}>
                <div className="row between" style={{ marginBottom: 12 }}><span className="tiny muted mono">{c.id} · engine {c.engine} · {c.transcript.length} turns</span>{l && <Link href={`/leads/${l.id}`} className="btn sm">Open lead →</Link>}</div>
                <div className="transcript">
                  {c.transcript.map((t, i) => (
                    <div key={i} className={`turn ${t.speaker}`}>
                      <div className="who">{t.speaker === "agent" ? "AI" : t.speaker === "caller" ? "Caller" : "Sys"}<small>{Math.floor(t.at / 60)}:{String(Math.floor(t.at % 60)).padStart(2, "0")}</small></div>
                      <div><div className="bubble">{t.text}</div>{t.meta?.kb?.length ? <div className="kbref">{t.meta.kb.map((k) => <span key={k}>↳ {k}</span>)}</div> : null}</div>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
