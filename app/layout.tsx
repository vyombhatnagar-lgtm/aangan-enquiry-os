import type { Metadata } from "next";
import Link from "next/link";
import "@fontsource-variable/instrument-sans/index.css";
import "@fontsource-variable/jetbrains-mono/index.css";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { Mark } from "@/components/Mark";
import { Phone } from "@/components/ui";
import { loadAll } from "@/lib/data";

export const metadata: Metadata = {
  title: "Aangan · Enquiry OS",
  description: "Aangan Studio enquiries, pipeline and outcomes.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let counts: Record<string, number> = {};
  let demo = 0;
  let dbError: string | null = null;
  try {
    const { leads, calls, metrics } = await loadAll();
    counts = { leads: leads.length, calls: calls.length, review: metrics.failures.reviewQueue.length };
    demo = leads.filter((l) => l.isDemo).length;
  } catch (e) {
    dbError = (e as Error).message;
  }
  return (
    <html lang="en-IN">
      <body>
        <div className="shell">
          <aside className="rail">
            <Link href="/" className="brand">
              <Mark />
              <div>
                <div className="brand-word">Aangan</div>
                <div className="brand-sub">Enquiry OS</div>
              </div>
            </Link>
            <Nav counts={counts} />
            <div className="rail-foot">
              <Link href="/simulate" className="ring-btn"><Phone size={15} /> Talk to agent</Link>
              {demo > 0 && <div className="demo-stamp">{demo === counts.leads ? "Demo data" : `${demo} demo enquiries`}</div>}
            </div>
          </aside>
          <div className="main">
            {dbError ? (
              <div className="page">
                <h1>Can&apos;t reach the database</h1>
                <p className="ink2">Please try again in a minute.</p>
              </div>
            ) : children}
          </div>
        </div>
      </body>
    </html>
  );
}
