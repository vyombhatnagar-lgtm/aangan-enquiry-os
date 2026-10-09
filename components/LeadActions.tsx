"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Lead } from "@/lib/types";

export function LeadActions({ lead }: { lead: Lead }) {
  const router = useRouter();
  const [user, setUser] = useState("Nikhil");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [lostReason, setLostReason] = useState("");
  const [when, setWhen] = useState("");
  const [ovStatus, setOvStatus] = useState(lead.decision === "QUALIFIED" ? "NOT_QUALIFIED" : "QUALIFIED");
  const [ovReason, setOvReason] = useState("");

  useEffect(() => { try { const u = localStorage.getItem("aangan.user"); if (u) setUser(u); } catch {} }, []);
  const saveUser = (u: string) => { setUser(u); try { localStorage.setItem("aangan.user", u); } catch {} };

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action); setErr(null);
    try {
      const r = await fetch(`/api/leads/${lead.id}/action`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, user, ...extra }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setValue(""); setLostReason(""); setOvReason("");
      router.refresh();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  }
  const done = lead.projectOutcome !== "PENDING";
  const B = ({ a, children, cls = "", disabled, extra }: { a: string; children: React.ReactNode; cls?: string; disabled?: boolean; extra?: Record<string, unknown> }) =>
    <button className={`btn sm ${cls}`} disabled={!!busy || disabled} onClick={() => act(a, extra)}>{busy === a ? "Saving…" : children}</button>;

  return (
    <div className="stack">
      <label className="field">Recording as
        <input value={user} onChange={(e) => saveUser(e.target.value)} placeholder="Your name" />
      </label>

      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Designer</div>
        <div className="row" style={{ gap: 6 }}>
          {lead.designerHandoffStatus === "SENT" && <B a="acknowledge">Acknowledge handoff</B>}
          {lead.decision === "QUALIFIED" && lead.designerHandoffStatus === "NOT_SENT" && <B a="resend" cls="terra">Send handoff</B>}
          <B a="contacted" disabled={!!lead.designerContactedAt}>{lead.designerContactedAt ? "✓ Contacted" : "Mark designer contacted"}</B>
        </div>
      </div>

      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Consultation · {lead.consultationStatus.replace(/_/g, " ").toLowerCase()}</div>
        <div className="row" style={{ gap: 6 }}>
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={{ flex: 1, minWidth: 150 }} aria-label="Consultation date and time" />
          <B a="schedule" extra={{ when: when ? new Date(when).toISOString() : undefined }}>Schedule</B>
        </div>
        <div className="row" style={{ gap: 6, marginTop: 6 }}>
          <B a="complete" disabled={lead.consultationStatus === "COMPLETED"}>Completed</B>
          <B a="noshow" cls="danger" disabled={lead.consultationStatus === "NO_SHOW"}>No-show</B>
        </div>
      </div>

      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Project outcome · human only</div>
        <div className="row" style={{ gap: 6 }}>
          <input inputMode="numeric" placeholder="Signed value, ₹" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ""))} style={{ flex: 1, minWidth: 120 }} aria-label="Project value in rupees" />
          <B a="won" cls="sage" disabled={!value} extra={{ value: Number(value) }}>Project won</B>
        </div>
        {value && <div className="tiny muted" style={{ marginTop: 4 }}>₹{Number(value).toLocaleString("en-IN")}</div>}
        <div className="row" style={{ gap: 6, marginTop: 6 }}>
          <input placeholder="Why lost? (optional)" value={lostReason} onChange={(e) => setLostReason(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
          <B a="lost" cls="danger" extra={{ reason: lostReason }}>Project lost</B>
        </div>
        {done && <div className="tiny muted" style={{ marginTop: 6 }}>Recorded by {lead.outcomeRecordedBy}. Recording again replaces it and is logged.</div>}
      </div>

      <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 12 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Override the AI · AI said {lead.aiDecision?.replace(/_/g, " ").toLowerCase() ?? "nothing"}</div>
        <div className="row" style={{ gap: 6 }}>
          <select value={ovStatus} onChange={(e) => setOvStatus(e.target.value)} style={{ flex: 1 }} aria-label="Human decision">
            <option value="QUALIFIED">Qualified</option>
            <option value="NOT_QUALIFIED">Not qualified</option>
            <option value="NEEDS_HUMAN_REVIEW">Needs review</option>
          </select>
        </div>
        <textarea rows={2} placeholder="Reason (required) — this is how qualified.md gets better" value={ovReason} onChange={(e) => setOvReason(e.target.value)} style={{ width: "100%", marginTop: 6 }} />
        <button className="btn sm primary" style={{ marginTop: 6 }} disabled={!!busy || !ovReason.trim()} onClick={() => act("override", { status: ovStatus, reason: ovReason })}>{busy === "override" ? "Saving…" : "Record override"}</button>
      </div>
      {err && <div className="callout err">{err}</div>}
    </div>
  );
}
