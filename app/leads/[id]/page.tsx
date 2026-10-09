import Link from "next/link";
import { notFound } from "next/navigation";
import { auditFor, callsForLead, getLead, listOverrides } from "@/lib/db";
import { duration, fmtDate, inr, istParts } from "@/lib/format";
import { getKB } from "@/lib/knowledge";
import { describeBudget } from "@/lib/pipeline";
import { Money, Pill } from "@/components/ui";
import { LeadActions } from "@/components/LeadActions";
import { CalendlyPanel } from "@/components/CalendlyPanel";
import { calendlyConfigured, calendlyWebhookConfigured } from "@/lib/calendly";

export const dynamic = "force-dynamic";

const BIZ = new Set(["PROJECT_WON", "PROJECT_LOST", "CONSULTATION_SCHEDULED", "CONSULTATION_CANCELED", "CONSULTATION_COMPLETED", "DESIGNER_CONTACTED", "HANDOFF_ACKNOWLEDGED"]);

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) notFound();
  const [calls, events, overrides] = await Promise.all([callsForLead(id), auditFor(id), listOverrides(id)]);
  const call = calls.at(-1);
  const thr = getKB().qualified.data.confidenceThreshold;
  const enq = istParts(lead.enquiryAt);
  const Val = ({ v, miss }: { v: React.ReactNode; miss?: boolean }) => (v == null || v === "" ? <dd className={miss ? "missing" : "muted"}>{miss ? "not captured" : "—"}</dd> : <dd>{v}</dd>);
  const evTime = (iso: string) => { const p = istParts(iso); return p.date === enq.date ? p.time : `${p.date.slice(5)} ${p.time}`; };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow"><Link href="/leads">Enquiries</Link> / <span className="mono">{lead.id}</span></div>
          <h1 style={{ marginTop: 6 }}>{lead.customerName ?? "Unknown caller"}</h1>
          <div className="row" style={{ marginTop: 10 }}>
            <Pill s={lead.status} />
            {lead.highValue && <span className="badge hv">high value</span>}
            {lead.afterHours && <span className="badge ah">after hours</span>}
            {lead.isDemo && <span className="badge demo">demo</span>}
            <span className="small muted">{fmtDate(lead.enquiryAt)} IST · phone · answered in {lead.responseTimeSeconds != null ? `${lead.responseTimeSeconds.toFixed(1)}s` : "—"} · engine {lead.engine}</span>
          </div>
        </div>
        {lead.projectOutcome === "WON" && <div style={{ textAlign: "right" }}><div className="eyebrow">Project won</div><div className="num" style={{ fontSize: 40, color: "var(--sage)" }}>{inr(lead.projectValue)}</div></div>}
      </div>

      <div className="detail-grid">
        <div className="stack" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="grid g2">
            <section className="card card-pad">
              <div className="panel-title"><h3>Customer</h3></div>
              <dl className="kv">
                <dt>Name</dt><Val v={lead.customerName} miss />
                <dt>Phone</dt><dd className="mono">{lead.phoneNumber}</dd>
                <dt>Location</dt><Val v={lead.location && <>{lead.location}{lead.inServiceArea === false && <span className="badge" style={{ marginLeft: 6 }}>outside Pune</span>}</>} miss />
              </dl>
            </section>
            <section className="card card-pad">
              <div className="panel-title"><h3>Project</h3></div>
              <dl className="kv">
                <dt>Type</dt><Val v={lead.projectType} miss />
                <dt>Property</dt><Val v={[lead.bhk ? `${lead.bhk} BHK` : null, lead.propertyType].filter(Boolean).join(" ")} />
                <dt>Area</dt><Val v={lead.approximateArea ? `${lead.approximateArea.toLocaleString("en-IN")} sq ft` : null} miss={lead.projectScope !== "kitchen_wardrobe"} />
                <dt>Budget</dt><Val v={lead.budget ? describeBudget(lead) : null} miss />
                <dt>Timeline</dt><Val v={lead.timeline && <>{lead.timeline}{lead.timelineMonths != null && <span className="muted"> · ~{lead.timelineMonths < 1 ? `${Math.round(lead.timelineMonths * 4)} wk` : `${Number(lead.timelineMonths.toFixed(1))} mo`}</span>}</>} miss />
                <dt>Requirements</dt><Val v={lead.requirements.join(", ")} />
              </dl>
            </section>
          </div>

          <section className="card card-pad">
            <div className="panel-title">
              <h3>Qualification</h3>
              <div className="row"><span className="tiny muted">AI</span><Pill s={lead.aiDecision ?? "NEW"} />{lead.decision !== lead.aiDecision && <><span className="tiny muted">→ human</span><Pill s={lead.decision} /></>}</div>
            </div>
            <p style={{ margin: "0 0 12px" }}>{lead.qualificationReason}</p>
            {lead.confidenceScore != null && (
              <div style={{ maxWidth: 360, marginBottom: 16 }}>
                <div className="row between tiny"><span className="muted">Confidence</span><span className="mono">{lead.confidenceScore} (threshold {thr})</span></div>
                <div className={`meter ${lead.confidenceScore < thr ? "low" : ""}`}><i style={{ width: `${lead.confidenceScore * 100}%` }} /><span className="thr" style={{ left: `${thr * 100}%` }} /></div>
              </div>
            )}
            {lead.ruleTrace.length > 0 && <div className="rules">{lead.ruleTrace.map((r) => <div key={r.id} className={`rule ${r.result}`}><span className="id">{r.id}</span><span className="res">{r.result}</span><span>{r.name}: {r.detail}<span className="src">{r.source}</span></span></div>)}</div>}
            {lead.decision === "NEEDS_HUMAN_REVIEW" || lead.reviewReasons.length > 0 ? (
              <div className="callout" style={{ marginTop: 14 }}>
                <b>Why a human is needed</b>
                <ul style={{ margin: "6px 0", paddingLeft: 18 }}>{lead.reviewReasons.map((r) => <li key={r}>{r}</li>)}</ul>
                {lead.missingFields.length > 0 && <div>Missing information: <b>{lead.missingFields.join(", ")}</b></div>}
              </div>
            ) : null}
            <div className="callout info" style={{ marginTop: 10 }}><b>Recommended next action:</b> {lead.recommendedAction}</div>
            {overrides.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div className="eyebrow" style={{ marginBottom: 6 }}>Override history</div>
                {overrides.map((o, i) => <div key={i} className="small" style={{ padding: "6px 0", borderBottom: "1px dotted var(--rule)" }}><span className="mono">{fmtDate(o.timestamp)}</span> · <b>{o.user}</b>: {o.originalAIStatus.toLowerCase().replace(/_/g, " ")} → {o.humanStatus.toLowerCase().replace(/_/g, " ")} — <i>{o.reason}</i></div>)}
              </div>
            )}
          </section>

          <section className="card card-pad">
            <div className="panel-title"><h3>Conversation</h3><span className="tiny muted mono">{call ? `${call.id} · ${duration(call.durationSec)} · ${call.status.toLowerCase()}` : "no call record"}</span></div>
            <div className="callout ok" style={{ marginBottom: 16 }}><b>AI summary.</b> {lead.conversationSummary}</div>
            <div className="transcript">
              {call?.transcript.map((t, i) => (
                <div key={i} className={`turn ${t.speaker}`}>
                  <div className="who">{t.speaker === "agent" ? "AI" : t.speaker === "caller" ? "Caller" : "Sys"}<small>{Math.floor(t.at / 60)}:{String(Math.floor(t.at % 60)).padStart(2, "0")}</small></div>
                  <div><div className="bubble">{t.text}</div>{t.meta?.kb?.length ? <div className="kbref">{t.meta.kb.map((k) => <span key={k}>↳ {k}</span>)}</div> : null}</div>
                </div>
              ))}
            </div>
          </section>

          <div className="grid g2">
            <section className="card card-pad">
              <div className="panel-title"><h3>Pricing</h3>{lead.indicativePricingShown ? <span className="pill p-SENT">discussed</span> : <span className="pill p-NEW">not discussed</span>}</div>
              <p className="small" style={{ margin: 0 }}>{lead.indicativePricingShown ? lead.indicativePricingText : "No pricing was given on this call."}</p>
              <p className="tiny muted" style={{ marginTop: 10 }}>Indicative only, from pricing.md. No quotation was issued.</p>
            </section>
            <section className="card card-pad">
              <div className="panel-title"><h3>Handoff</h3><Pill s={lead.designerHandoffStatus} /></div>
              <dl className="kv small">
                <dt>Assigned</dt><Val v={lead.designerAssigned} />
                <dt>Channel</dt><Val v={lead.handoffChannel === "simulated" ? "Telegram (simulated)" : lead.handoffChannel} />
                <dt>Sent</dt><Val v={lead.handoffSentAt && fmtDate(lead.handoffSentAt)} />
                <dt>Acknowledged</dt><Val v={lead.handoffAckAt && fmtDate(lead.handoffAckAt)} />
                <dt>Contacted</dt><Val v={lead.designerContactedAt && <>{fmtDate(lead.designerContactedAt)}{lead.handoffSentAt && <span className="muted"> · {duration((new Date(lead.designerContactedAt).getTime() - new Date(lead.handoffSentAt).getTime()) / 1000)} after handoff</span>}</>} />
              </dl>
            </section>
          </div>

          {lead.handoffMessage && (
            <section className="card card-pad">
              <div className="panel-title"><h3>Telegram message</h3><span className="tiny muted">notification only — this page is the record</span></div>
              <div className="tg" style={{ maxWidth: 460 }}>
                <div className="tg-head"><div className="tg-av">A</div><div><div style={{ fontWeight: 600 }}>Aangan Enquiries</div><div style={{ fontSize: 11, color: "#7f91a4" }}>bot · to {lead.designerAssigned}</div></div></div>
                <div className="tg-msg">{lead.handoffMessage}</div>
                <div className="tg-btns"><span>✅ Acknowledge</span><span>📞 Contacted</span></div>
              </div>
            </section>
          )}

          <section className="card card-pad">
            <div className="panel-title"><h3>Audit trail</h3><span className="tiny muted">{events.length} events · append-only</span></div>
            <ol className="audit">
              {events.map((e) => (
                <li key={e.id} className={`${e.severity ?? ""} ${BIZ.has(e.type) ? "biz" : ""}`}>
                  <span className="t">{evTime(e.at)}</span><span className="k" />
                  <span className="m">{e.message} <span className="actor">· {e.actor}</span></span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="sticky stack" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <section className="card card-pad">
            <div className="panel-title"><h3>Outcome</h3><Pill s={lead.projectOutcome} /></div>
            <dl className="kv small" style={{ marginBottom: 14 }}>
              <dt>Contacted</dt><dd>{lead.designerContactedAt ? "Yes" : "No"}</dd>
              <dt>Consultation</dt><dd>{lead.consultationStatus.replace(/_/g, " ").toLowerCase()}{lead.consultationSource === "calendly" && <span className="badge" style={{ marginLeft: 6 }}>via Calendly</span>}{lead.consultationAt && <span className="muted"> · {fmtDate(lead.consultationAt)}</span>}</dd>
              <dt>Value</dt><dd><Money v={lead.projectValue} /></dd>
              <dt>AI cost</dt><dd className="mono">{inr(lead.aiCost, { dp: 2 })}</dd>
            </dl>
            <LeadActions lead={lead} />
          </section>
          {(lead.bookingUrl || lead.decision === "QUALIFIED") && (
            <section className="card card-pad">
              <div className="panel-title"><h3>Consultation booking</h3><span className="badge">Calendly</span></div>
              <CalendlyPanel lead={lead} live={calendlyConfigured()} webhook={calendlyWebhookConfigured()} />
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
