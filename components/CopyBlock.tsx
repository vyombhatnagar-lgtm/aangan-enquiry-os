"use client";
import { useState } from "react";
export function CopyBlock({ text, label, rows = 12 }: { text: string; label: string; rows?: number }) {
  const [ok, setOk] = useState(false);
  return (
    <div>
      <div className="row between" style={{ marginBottom: 6 }}>
        <span className="eyebrow">{label}</span>
        <button className="btn sm" onClick={() => navigator.clipboard.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); })}>{ok ? "Copied" : "Copy"}</button>
      </div>
      <textarea readOnly value={text} rows={rows} style={{ width: "100%", font: "12px/1.5 var(--mono)", background: "var(--paper-2)" }} onFocus={(e) => e.currentTarget.select()} />
    </div>
  );
}
