"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteLead({ id }: { id: string }) {
  const r = useRouter();
  const [step, setStep] = useState(0);
  return (
    <div className="row" style={{ gap: 8 }}>
      {step === 1 && <button className="btn sm" onClick={() => setStep(0)}>Cancel</button>}
      <button className={`btn sm ${step === 1 ? "danger" : "ghost"}`} disabled={step === 2} onClick={async () => {
        if (step === 0) return setStep(1);
        setStep(2);
        const x = await fetch(`/api/leads/${id}/action`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "delete" }) });
        if (x.ok) { r.push("/leads"); r.refresh(); } else setStep(0);
      }}>{step === 0 ? "Delete enquiry" : step === 1 ? "Yes, delete permanently" : "Deleting…"}</button>
    </div>
  );
}
