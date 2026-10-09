import { inrShort } from "@/lib/format";

type Step = { key: string; label: string; count: number; fromPrev: number | null; dropoff: number | null };

/**
 * The funnel as a stepwell (baoli): enquiries enter at the top terrace and descend;
 * only what reaches the water at the bottom is revenue.
 */
export function Stepwell({ steps, revenue, won }: { steps: Step[]; revenue: number; won: number }) {
  const W = 1000, H0 = 74, gap = 8, top = steps[0]?.count || 1;
  const maxW = 600, minW = 120;
  const width = (c: number) => minW + (c / top) * (maxW - minW);
  const shades = ["#d9b98a", "#cf9f6c", "#c3824f", "#b8663a", "var(--terra)"];
  const totalH = steps.length * (H0 + gap) + 150;
  return (
    <svg viewBox={`0 0 ${W} ${totalH}`} className="stepwell" role="img" aria-label={`Funnel: ${steps.map((s) => `${s.label} ${s.count}`).join(", ")}; revenue ${inrShort(revenue)}`}>
      <defs>
        <linearGradient id="water" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#3f8f8a" />
          <stop offset="1" stopColor="#1d4f55" />
        </linearGradient>
        <pattern id="stone" width="22" height="12" patternUnits="userSpaceOnUse">
          <path d="M0 11.5h22M11 0v6M0 6h22M0 0v6M22 6v6" stroke="rgba(0,0,0,.09)" strokeWidth="1" fill="none" />
        </pattern>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" /></filter>
      </defs>
      {steps.map((s, i) => {
        const w = width(s.count);
        const wNext = i < steps.length - 1 ? width(steps[i + 1].count) : w * 0.92;
        const y = i * (H0 + gap);
        const x = (W - w) / 2;
        const inset = Math.max(10, (w - Math.max(wNext, w * 0.9)) / 2);
        const tread = `M${x},${y} L${x + w},${y} L${x + w - inset},${y + H0 - 14} L${x + inset},${y + H0 - 14} Z`;
        const riser = `M${x + inset},${y + H0 - 14} L${x + w - inset},${y + H0 - 14} L${x + w - inset},${y + H0} L${x + inset},${y + H0} Z`;
        const last = i === steps.length - 1;
        return (
          <g key={s.key} className="sw-step" style={{ animationDelay: `${i * 120}ms` }}>
            <path d={tread} fill={shades[Math.min(i, shades.length - 1)]} />
            <path d={tread} fill="url(#stone)" />
            <path d={riser} fill="rgba(40,22,10,.35)" />
            <text x={W / 2} y={y + 38} textAnchor="middle" className="sw-count" fill={last ? "#fff8f0" : "#2a1a0e"}>{s.count}</text>
            <text x={x - 14} y={y + 30} textAnchor="end" className="sw-label">{s.label}</text>
            {s.fromPrev != null && <text x={x - 14} y={y + 48} textAnchor="end" className="sw-sub">{Math.round(s.fromPrev * 100)}% of previous</text>}
            {s.dropoff != null && s.dropoff > 0 && <text x={x + w + 14} y={y + 34} className="sw-drop">−{Math.round(s.dropoff * 100)}% · {steps[i - 1].count - s.count} lost</text>}
          </g>
        );
      })}
      {(() => {
        const y = steps.length * (H0 + gap) + 10;
        const w = Math.max(460, width(steps.at(-1)?.count ?? 0) + 120);
        const x = (W - w) / 2;
        return (
          <g className="sw-water">
            <ellipse cx={W / 2} cy={y + 50} rx={w / 2 + 30} ry={40} fill="#3f8f8a" opacity=".35" filter="url(#glow)" />
            <rect x={x} y={y} width={w} height={96} rx={6} fill="url(#water)" />
            <path className="sw-wave" d={`M${x} ${y + 14} q 20 -10 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0`} stroke="rgba(255,255,255,.35)" strokeWidth="2" fill="none" />
            <text x={W / 2} y={y + 58} textAnchor="middle" className="sw-rev">{inrShort(revenue)}</text>
            <text x={W / 2} y={y + 82} textAnchor="middle" className="sw-revsub">revenue from {won} won project{won === 1 ? "" : "s"} · only this counts</text>
          </g>
        );
      })()}
    </svg>
  );
}
