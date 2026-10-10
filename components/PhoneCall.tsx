"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Phone, Pill } from "./ui";

type Status = { status: "ringing" | "done" | "failed"; leadId?: string; decision?: string; name?: string; summary?: string; error?: string };

export function PhoneCall({ ready }: { ready: boolean }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [skipDnd, setSkipDnd] = useState(true);
  const [callId, setCallId] = useState<string | null>(null);
  const [st, setSt] = useState<Status | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem("aangan-phone") ?? "{}"); if (s.name) setName(s.name); if (s.phone) setPhone(s.phone); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!callId) return;
    const t0 = Date.now();
    timer.current = setInterval(async () => {
      setElapsed(Math.round((Date.now() - t0) / 1000));
      try {
        const r = await fetch(`/api/calls/outbound?id=${encodeURIComponent(callId)}`, { cache: "no-store" });
        const j = (await r.json()) as Status;
        setSt(j);
        if (j.status !== "ringing" && timer.current) clearInterval(timer.current);
      } catch { /* keep polling */ }
      if (Date.now() - t0 > 20 * 60_000 && timer.current) clearInterval(timer.current);
    }, 4000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [callId]);

  const call = async () => {
    setBusy(true); setErr(null); setSt(null); setCallId(null); setElapsed(0);
    try { localStorage.setItem("aangan-phone", JSON.stringify({ name, phone })); } catch { /* ignore */ }
    const r = await fetch("/api/calls/outbound", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, phone, skipDnd }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? "Couldn't start the call");
    setCallId(j.callId);
  };

  const mm = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <section className="card card-pad callme">
      <div className="callme-grid">
        <div>
          <h3 style={{ margin: 0 }}>Or get a call on your phone</h3>
          <p className="small muted" style={{ margin: "4px 0 14px" }}>Prefer a real phone call? The agent rings your mobile; when you hang up, the enquiry appears here.</p>
          {!ready ? (
            <div className="callout">Available once the agent is connected (same key as above).</div>
          ) : (
            <form className="callme-form" onSubmit={(e) => { e.preventDefault(); call(); }}>
              <label><span>Your name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Vyom" /></label>
              <label><span>Mobile number</span><div className="row" style={{ gap: 6, flexWrap: "nowrap" }}><span className="prefix">+91</span><input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" required style={{ flex: 1 }} /></div></label>
              <label className="row small" style={{ gap: 8 }}><input type="checkbox" checked={skipDnd} onChange={(e) => setSkipDnd(e.target.checked)} /> My number has DND on (skip the check)</label>
              <button className="btn terra" disabled={busy || (!!callId && st?.status === "ringing")}><Phone size={15} /> {busy ? "Starting…" : callId && st?.status !== "done" && st?.status !== "failed" ? "Call in progress" : "Call me now"}</button>
              {err && <div className="callout err">{err}</div>}
            </form>
          )}
        </div>

        <div className="callme-status">
          {!callId && <div className="small muted">Status appears here once the call starts.</div>}
          {callId && (!st || st.status === "ringing") && (
            <div>
              <div className="row" style={{ gap: 8 }}><span className="live-dot" /> <b>Calling you…</b> <span className="mono small muted">{mm}</span></div>
              <p className="small muted" style={{ margin: "6px 0 0" }}>Pick up and talk. After you hang up it takes up to a minute for the result to arrive.</p>
            </div>
          )}
          {st?.status === "failed" && <div className="callout err">The call didn&apos;t connect{st.error ? `: ${st.error}` : ""}. Check the number and DND, then try again.</div>}
          {st?.status === "done" && st.leadId && (
            <div>
              <div className="row" style={{ gap: 8, marginBottom: 6 }}><b>{st.name ?? "Call processed"}</b>{st.decision && <Pill s={st.decision} />}</div>
              {st.summary && <p className="small ink2" style={{ margin: "0 0 10px" }}>{st.summary}</p>}
              <Link className="btn sm primary" href={`/leads/${st.leadId}`}>Open the enquiry →</Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
