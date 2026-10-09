"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Baseline } from "@/lib/types";

const FIELDS: [keyof Baseline, string][] = [["enquiries", "Enquiries"], ["responded5min", "Answered < 5 min"], ["qualified", "Qualified"], ["handoffs", "Sent to designer"], ["consultations", "Consultations"], ["won", "Projects won"], ["revenue", "Revenue (₹)"]];

export function BaselineForm({ b }: { b: Baseline | null }) {
  const router = useRouter();
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries([["label", b?.label ?? "Manual front desk"], ["period", b?.period ?? ""], ["design", b?.design ?? "PRE_POST"], ["notes", b?.source === "ENTERED" ? b.notes : ""], ...FIELDS.map(([k]) => [k, b ? String(b[k]) : ""])]));
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function post(body: unknown) {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/baseline", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) setMsg(j.error); else { setMsg("Saved."); router.refresh(); }
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); post(v); }}>
      <div className="grid g4">
        <label className="field">Label<input value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })} /></label>
        <label className="field">Period<input value={v.period} placeholder="2026-07-01 → 2026-07-31" onChange={(e) => setV({ ...v, period: e.target.value })} /></label>
        <label className="field">Comparison design
          <select value={v.design} onChange={(e) => setV({ ...v, design: e.target.value })}>
            <option value="PRE_POST">Before / after (observational)</option>
            <option value="RANDOMISED">Randomised (alternate days / numbers)</option>
          </select>
        </label>
        <div />
        {FIELDS.map(([k, label]) => <label key={k} className="field">{label}<input inputMode="numeric" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value.replace(/[^\d]/g, "") })} /></label>)}
      </div>
      <label className="field" style={{ marginTop: 12 }}>Notes / source<input value={v.notes} placeholder="e.g. From the front-desk register and Tally, July 2026" onChange={(e) => setV({ ...v, notes: e.target.value })} /></label>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn primary" disabled={busy}>Save as real baseline</button>
        <button type="button" className="btn ghost" disabled={busy} onClick={() => post({ restoreDemo: true })}>Restore demo assumption</button>
        {msg && <span className="small muted">{msg}</span>}
      </div>
    </form>
  );
}
