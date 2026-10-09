import type { Metadata } from "next";
import Link from "next/link";
import "@fontsource-variable/fraunces/full.css";
import "@fontsource-variable/fraunces/full-italic.css";
import "@fontsource-variable/instrument-sans/index.css";
import "@fontsource-variable/jetbrains-mono/index.css";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { Mark } from "@/components/Mark";
import { Phone } from "@/components/ui";
import { Ticker } from "@/components/Ticker";
import type { Lead } from "@/lib/types";
import { loadAll } from "@/lib/data";
import { llmAvailable } from "@/lib/engine/llm";
import { telegramConfigured } from "@/lib/handoff";
import { calendlyConfigured, calendlyWebhookConfigured } from "@/lib/calendly";


export const metadata: Metadata = {
  title: "Aangan · Enquiry OS",
  description: "Inbound phone enquiry qualification for Aangan Studio — measured by projects won, not calls answered.",
};
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let counts: Record<string, number> = {};
  let recent: Lead[] = [];
  let dbError: string | null = null;
  try {
    const { leads, calls, metrics } = await loadAll();
    counts = { leads: leads.length, calls: calls.length, review: metrics.failures.reviewQueue.length };
    recent = leads;
  } catch (e) {
    dbError = (e as Error).message;
  }
  const llm = llmAvailable();
  const tg = telegramConfigured();
  return (
    <html lang="en-IN">
      <body>
        <div className="grain" aria-hidden />
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
              <Link href="/simulate" className="ring-btn"><span className="dot" /><Phone size={16} /> Simulate incoming call</Link>
              <div className="demo-stamp">Prototype · demo data<span>Knowledge files, 40 enquiries and the baseline are invented.</span></div>
            </div>
          </aside>
          <div className="main">
            <div className="strip">
              <span className="live">Phone line answered 24 × 7</span>
              <span>Engine <b>{llm ? "rules + AI Gateway" : "rules only"}</b></span>
              <span>Handoff <b>{tg ? "Telegram live" : "Telegram simulated"}</b></span>
              <span>Booking <b>{calendlyConfigured() ? (calendlyWebhookConfigured() ? "Calendly synced" : "Calendly link only") : "Calendly demo"}</b></span>
              <span>Channel <b>PHONE</b> <span className="muted">(WhatsApp, web: not in this version)</span></span>
            </div>
            <Ticker leads={recent} />
            {dbError ? (
              <div className="page">
                <h1>Database not connected</h1>
                <p className="ink2" style={{ maxWidth: "60ch" }}>{dbError}</p>
                <div className="callout info" style={{ maxWidth: 680, marginTop: 18 }}>
                  In Vercel: <b>Storage → Create → Neon (Serverless Postgres)</b>, connect it to this project, then redeploy. The schema and demo data are created automatically on first load.
                </div>
              </div>
            ) : children}
          </div>
        </div>
      </body>
    </html>
  );
}
