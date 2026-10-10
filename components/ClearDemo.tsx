"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ClearDemo({ count }: { count: number }) {
  const r = useRouter();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [err, setErr] = useState<string | null>(null);
  if (!count) return null;
  return (
    <div className="card card-pad row between" style={{ gap: 12, flexWrap: "wrap" }}>
      <div className="small"><b>Going live?</b> <span className="ink2">Remove the {count} demo enquiries so the numbers only show real calls.</span></div>
      <div className="row" style={{ gap: 8 }}>
        {step === 1 && <button className="btn sm" onClick={() => setStep(0)}>Cancel</button>}
        <button className={`btn sm ${step === 1 ? "danger" : ""}`} disabled={step === 2} onClick={async () => {
          if (step === 0) return setStep(1);
          setStep(2); setErr(null);
          const x = await fetch("/api/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ clear: true }) });
          if (!x.ok) { setErr("Couldn't remove demo data"); setStep(0); return; }
          r.refresh();
        }}>{step === 0 ? "Remove demo data" : step === 1 ? `Yes, remove ${count}` : "Removing…"}</button>
        {err && <span className="tiny" style={{ color: "var(--red)" }}>{err}</span>}
      </div>
    </div>
  );
}
