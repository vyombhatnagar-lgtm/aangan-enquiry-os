"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS: { href: string; label: string; key?: string }[] = [
  { href: "/", label: "Overview" },
  { href: "/leads", label: "Enquiries", key: "leads" },
  { href: "/failures", label: "Needs attention", key: "review" },
  { href: "/intelligence", label: "Insights" },
  { href: "/calls", label: "Calls", key: "calls" },
  { href: "/analytics", label: "Performance" },
  { href: "/costs", label: "Costs" },
];

export function Nav({ counts }: { counts: Record<string, number> }) {
  const path = usePathname();
  return (
    <nav className="nav">
      {ITEMS.map((i) => {
        const on = i.href === "/" ? path === "/" : path.startsWith(i.href);
        const c = i.key ? counts[i.key] : undefined;
        return (
          <Link key={i.href} href={i.href} className={on ? "on" : ""}>
            <span>{i.label}</span>
            {c != null && <span className={`count ${i.key === "review" && c > 0 ? "alert" : ""}`}>{c}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
