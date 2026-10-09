"use client";
import { useEffect, useRef, useState } from "react";

/** Animates a number up from zero once, then shows the exact server-formatted value. */
export function CountUp({ value, format, ms = 1400 }: { value: number; format: "inrShort" | "pct" | "int" | "pp"; ms?: number }) {
  const [v, setV] = useState(0);
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return; done.current = true;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setV(value); return; }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - p, 4);
      setV(value * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <>{fmt(v, format)}</>;
}

function fmt(n: number, f: string) {
  if (f === "pct") return `${(n * 100).toFixed(1)}%`;
  if (f === "pp") return `${n >= 0 ? "+" : "−"}${Math.abs(n * 100).toFixed(1)} pp`;
  if (f === "int") return Math.round(n).toLocaleString("en-IN");
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `₹${(a / 1e5).toFixed(1)} L`;
  if (a >= 1e3) return `₹${(a / 1e3).toFixed(1)}k`;
  return `₹${Math.round(a)}`;
}
