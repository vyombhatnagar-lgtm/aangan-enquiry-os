"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ReanalyseButton({ leadId }: { leadId: string }) {
  const r = useRouter(); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  return (
    <span className="row" style={{ gap: 8 }}>
      <button className="btn sm" disabled={busy} onClick={async () => { setBusy(true); setErr(null); const x = await fetch(`/api/leads/${leadId}/analyze`, { method: "POST" }); const j = await x.json(); setBusy(false); if (!x.ok) setErr(j.error); else r.refresh(); }}>{busy ? "Analysing…" : "Re-analyse"}</button>
      {err && <span className="tiny" style={{ color: "var(--brick)" }}>{err}</span>}
    </span>
  );
}

export function BatchButton() {
  const r = useRouter(); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="row" style={{ gap: 10 }}>
      <button className="btn terra" disabled={busy} onClick={async () => { setBusy(true); setMsg(null); const x = await fetch("/api/intel/batch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) }); const j = await x.json(); setBusy(false); setMsg(x.ok ? `${j.analysed} analysed (${j.ai} by AI), ${j.skipped} skipped, ${j.failed.length} failed` : j.error); r.refresh(); }}>{busy ? "Running 10 workers…" : "Run batch analysis"}</button>
      {msg && <span className="small muted">{msg}</span>}
    </span>
  );
}
