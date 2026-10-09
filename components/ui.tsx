import { inr, inrShort } from "@/lib/format";
import type { ReactNode } from "react";

export function Pill({ s, label }: { s?: string | null; label?: string }) {
  if (!s) return <span className="pill p-NEW">—</span>;
  return <span className={`pill p-${s}`}>{label ?? s.replace(/_/g, " ").toLowerCase()}</span>;
}

export function Money({ v, short }: { v: number | null | undefined; short?: boolean }) {
  return <span className="num" title={v != null ? inr(v) : undefined}>{short ? inrShort(v) : inr(v)}</span>;
}

export function Stat({ label, value, sub, tag, cls = "", hero }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tag?: "lead" | "lag"; cls?: string; hero?: boolean }) {
  return (
    <div className={`card stat ${hero ? "hero" : ""} ${cls}`}>
      <div className="label"><span>{label}</span>{tag && <span className={`indicator-tag tag-${tag}`}>{tag === "lead" ? "leading" : "lagging"}</span>}</div>
      <div className="value num">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export function SecHead({ eyebrow, title, right }: { eyebrow: string; title?: ReactNode; right?: ReactNode }) {
  return (
    <div className="sec-head">
      <div><div className="eyebrow">{eyebrow}</div>{title && <h2 style={{ marginTop: 4 }}>{title}</h2>}</div>
      {right && <div className="small muted">{right}</div>}
    </div>
  );
}

export function Funnel({ steps }: { steps: { key: string; label: string; count: number; fromPrev: number | null; fromTop: number; dropoff: number | null }[] }) {
  const top = steps[0]?.count || 1;
  return (
    <div className="steps">
      {steps.map((s, i) => (
        <div key={s.key}>
          {i > 0 && s.dropoff != null && <div className="drop">↓ {Math.round(s.dropoff * 100)}% drop-off ({steps[i - 1].count - s.count} lost)</div>}
          <div className="step">
            <div className="step-label"><b>{s.count}</b>{s.label}</div>
            <div className="step-bar"><div className="step-fill" style={{ background: i === steps.length - 1 ? "var(--terra)" : undefined, width: `${Math.max(0.5, (s.count / top) * 100)}%` }}>{s.count / top >= 0.12 ? `${Math.round((s.count / top) * 100)}%` : ""}</div></div>
            <div className="step-rate">{i === 0 ? <><b>100%</b>of enquiries</> : <><b>{s.fromPrev != null ? `${Math.round(s.fromPrev * 100)}%` : "—"}</b>of previous</>}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Phone({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />
    </svg>
  );
}
