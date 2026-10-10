"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Phone, Pill } from "./ui";

type Scenario = { key: string; title: string; blurb: string };
type Status = { status: "ringing" | "done" | "failed"; leadId?: string; decision?: string; name?: string; summary?: string; error?: string };

export function PhoneCall({ ready, scenarios }: { ready: boolean; scenarios: Scenario[] }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [skipDnd, setSkipDnd] = useState(true);
  const [role, setRole] = useState(scenarios[0]?.key ?? "");
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

  const sc = scenarios.find((s) => s.key === role);
  const mm = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <section className="card card-pad callme">
      <div className="callme-grid">
        <div>
          <h2 style={{ margin: 0 }}>Call my phone</h2>
          <p className="small muted" style={{ margin: "4px 0 14px" }}>Aangan&apos;s line rings your mobile. You play the customer; when you hang up, the enquiry appears here with its decision.</p>
          {!ready ? (
            <div className="callout">Phone calling isn&apos;t connected yet. Add <b>VAANI_API_KEY</b> in Vercel → Settings → Environment Variables, then redeploy.</div>
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

        <div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Play a customer (optional)</div>
          <select value={role} onChange={(e) => setRole(e.target.value)} style={{ width: "100%" }}>
            {scenarios.map((s) => <option key={s.key} value={s.key}>{s.title}</option>)}
          </select>
          {sc && <p className="small ink2" style={{ margin: "8px 0 0" }}>{sc.blurb}</p>}
          <p className="tiny muted" style={{ marginTop: 8 }}>Or just talk naturally — ask what it costs, change your mind, ask for a final quote.</p>
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
