"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const GROUPS: { title: string; items: { href: string; label: string; key?: string }[] }[] = [
  { title: "Business", items: [{ href: "/", label: "Overview" }, { href: "/analytics", label: "Analytics & ROI" }, { href: "/analytics#experiment", label: "Experiment" }, { href: "/costs", label: "Costs" }] },
  { title: "Operations", items: [{ href: "/leads", label: "Enquiries", key: "leads" }, { href: "/calls", label: "Calls", key: "calls" }, { href: "/failures", label: "Review & failures", key: "review" }] },
  { title: "System", items: [{ href: "/agent", label: "Voice agent (Vaani)" }, { href: "/knowledge", label: "Knowledge" }, { href: "/system", label: "How it works" }] },
];

export function Nav({ counts }: { counts: Record<string, number> }) {
  const path = usePathname();
  return (
    <nav className="nav">
      {GROUPS.map((g) => (
        <div key={g.title} style={{ display: "contents" }}>
          <div className="nav-group">{g.title}</div>
          {g.items.map((i) => {
            const on = i.href === "/" ? path === "/" : path.startsWith(i.href.split("#")[0]) && !i.href.includes("#");
            const c = i.key ? counts[i.key] : undefined;
            return (
              <Link key={i.href} href={i.href} className={on ? "on" : ""}>
                <span>{i.label}</span>
                {c != null && <span className={`count ${i.key === "review" && c > 0 ? "alert" : ""}`}>{c}</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
