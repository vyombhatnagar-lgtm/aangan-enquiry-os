"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
export function ResetButton() {
  const r = useRouter();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <button className={`btn sm ${armed ? "danger" : "ghost"}`} disabled={busy} onClick={async () => {
      if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 4000); return; }
      setBusy(true); await fetch("/api/reset", { method: "POST" }); setBusy(false); setArmed(false); r.refresh();
    }}>{busy ? "Resetting…" : armed ? "Click again to wipe and reseed" : "Reset demo data"}</button>
  );
}
