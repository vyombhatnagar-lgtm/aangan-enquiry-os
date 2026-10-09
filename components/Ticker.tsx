import Link from "next/link";
import type { Lead } from "@/lib/types";
import { fmtTime, inrShort } from "@/lib/format";

/** A slow marquee of the latest calls — the line never sleeps, and this is what it heard. */
export function Ticker({ leads }: { leads: Lead[] }) {
  const items = leads.slice(0, 14);
  if (!items.length) return null;
  const row = (k: string) => items.map((l) => (
    <Link key={k + l.id} aria-hidden={k === "b" ? true : undefined} tabIndex={k === "b" ? -1 : undefined} href={`/leads/${l.id}`} className={`tk tk-${l.decision ?? "NEW"}`}>
      <span className="tk-t">{fmtTime(l.enquiryAt)}{l.afterHours ? " ☾" : ""}</span>
      <span className="tk-n">{l.customerName ?? "Unknown caller"}</span>
      <span className="tk-p">{[l.bhk ? `${l.bhk} BHK` : l.projectType, l.location?.replace(", Pune", "")].filter(Boolean).join(" · ") || "no conversation"}</span>
      <span className="tk-d">{l.projectOutcome === "WON" ? `WON ${inrShort(l.projectValue)}` : (l.decision ?? "CALL BACK").replace(/_/g, " ")}</span>
    </Link>
  ));
  return (
    <div className="ticker" aria-label="Latest calls">
      <div className="ticker-track">{row("a")}{row("b")}</div>
    </div>
  );
}
