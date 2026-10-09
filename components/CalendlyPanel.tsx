"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Lead } from "@/lib/types";

export function CalendlyPanel({ lead, live, webhook }: { lead: Lead; live: boolean; webhook: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const url = lead.bookingUrl;
  const booked = lead.consultationSource === "calendly" && lead.calendly;

  async function sim(action: "book" | "cancel" | "noshow") {
    setBusy(action); setErr(null);
    const r = await fetch("/api/calendly/simulate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ leadId: lead.id, action }) });
    const j = await r.json(); setBusy(null);
    if (!r.ok) setErr(j.error); else router.refresh();
  }

  if (!url) return <p className="small muted" style={{ margin: 0 }}>A booking link is created when the lead is qualified and handed to a designer.</p>;
  return (
    <div className="stack">
      {booked ? (
        <div className="callout ok" style={{ fontSize: 13 }}>
          <b>Booked on Calendly</b> for {lead.consultationAt ? new Date(lead.consultationAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}
          <div className="tiny muted" style={{ marginTop: 4 }}>matched by {lead.calendly?.matchedBy} · booked {new Date(lead.calendly!.bookedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
          <div className="row" style={{ gap: 10, marginTop: 6 }}>
            {lead.calendly?.rescheduleUrl && <a className="tiny" href={lead.calendly.rescheduleUrl} target="_blank" rel="noreferrer">Reschedule ↗</a>}
            {lead.calendly?.cancelUrl && <a className="tiny" href={lead.calendly.cancelUrl} target="_blank" rel="noreferrer">Cancel ↗</a>}
          </div>
        </div>
      ) : lead.consultationStatus === "SCHEDULED" ? (
        <div className="small muted">Scheduled manually, not through Calendly.</div>
      ) : (
        <div className="small ink2">Not booked yet. Book it with the customer while on the call, or send them the link.</div>
      )}
      <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} style={{ flex: 1, fontFamily: "var(--mono)", fontSize: 11.5 }} aria-label="Calendly booking link" />
        <button className="btn sm" onClick={() => navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>{copied ? "Copied" : "Copy"}</button>
      </div>
      <a className="btn sm terra" href={url} target="_blank" rel="noreferrer">Open Calendly · book for them ↗</a>
      <div className="tiny muted">Prefilled with name and phone. <code>utm_campaign={lead.id}</code> ties the booking back to this lead.{!live && " Using a placeholder event URL — set CALENDLY_EVENT_URL."}{live && !webhook && " Webhook signing key not set — bookings won't sync automatically."}</div>
      <div style={{ borderTop: "1px dashed var(--rule)", paddingTop: 8 }}>
        <div className="tiny muted" style={{ marginBottom: 6 }}>Demo: play the customer&apos;s side through the real webhook handler</div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm" disabled={!!busy} onClick={() => sim("book")}>{busy === "book" ? "…" : "Customer books"}</button>
          <button className="btn sm" disabled={!!busy || !booked} onClick={() => sim("cancel")}>{busy === "cancel" ? "…" : "Customer cancels"}</button>
          <button className="btn sm danger" disabled={!!busy || !booked} onClick={() => sim("noshow")}>{busy === "noshow" ? "…" : "No-show"}</button>
        </div>
      </div>
      {err && <div className="callout err">{err}</div>}
    </div>
  );
}
