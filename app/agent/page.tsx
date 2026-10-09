import { headers } from "next/headers";
import { buildVaaniPrompt, getVaaniSecret, VAANI_DATA_POINTS, VAANI_GREETING } from "@/lib/vaani";
import { CopyBlock } from "@/components/CopyBlock";
import { SecHead } from "@/components/ui";
import { listCalls } from "@/lib/db";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AgentPage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "<your-app>";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const base = process.env.APP_URL ?? `${proto}://${host}`;
  const secret = await getVaaniSecret();
  const hook = `${base}/api/vaani/webhook/${secret}`;
  const calls = (await listCalls()).filter((c) => c.engine.startsWith("Vaani"));
  const analysis = { extraction: { data_collection: { enabled: true, data_points: VAANI_DATA_POINTS } } };
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">System</div>
          <h1>Voice agent · Vaani AI</h1>
          <p>Vaani answers the real phone line in Hindi, Marathi and English. Its instructions are generated from the same knowledge files the decision engine reads, so the agent and the rules can&apos;t drift apart. Vaani talks; this app decides.</p>
        </div>
      </div>
      <div className="grid g3">
        <div className="card stat"><div className="label">Webhook</div><div className="value" style={{ fontSize: 20, color: "var(--sage)" }}>ready</div><div className="sub">secret URL below — treat it like a password</div></div>
        <div className="card stat"><div className="label">Calls received from Vaani</div><div className="value num">{calls.length}</div><div className="sub">{calls[0] ? `last ${fmtDate(calls[0].startedAt)}` : "none yet"}</div></div>
        <div className="card stat"><div className="label">After the call</div><div className="value" style={{ fontSize: 18 }}>Rules decide</div><div className="sub">Vaani&apos;s data fills gaps only; prices audited vs pricing.md</div></div>
      </div>

      <section className="sec">
        <SecHead eyebrow="Set up in Vaani" title="Four things to paste" />
        <ol className="small ink2" style={{ paddingLeft: 18, lineHeight: 1.8 }}>
          <li><b>Persona → Greeting message:</b> paste the greeting below. Language: English + Hindi (multilingual if available).</li>
          <li><b>Training / Prompt:</b> paste the agent instructions below.</li>
          <li><b>Analysis → Data collection:</b> add each data point below (name + prompt), or send the JSON via <code>PATCH /api/agent/&lt;id&gt;/analysis</code>.</li>
          <li><b>Settings → Webhooks:</b> add the webhook URL from the right-hand panel and attach your inbound number under Telephony.</li>
        </ol>
      </section>

      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="card card-pad stack">
          <CopyBlock label="Greeting message" text={VAANI_GREETING} rows={3} />
          <CopyBlock label="Agent instructions (prompt)" text={buildVaaniPrompt()} rows={26} />
        </div>
        <div className="card card-pad stack">
          <CopyBlock label="Webhook URL (secret)" text={hook} rows={2} />
          <div>
            <div className="eyebrow" style={{ marginBottom: 6 }}>Data collection points</div>
            <table className="tbl"><tbody>{VAANI_DATA_POINTS.map((d) => <tr key={d.name}><td className="mono small">{d.name}</td><td className="small ink2">{d.prompt}</td></tr>)}</tbody></table>
          </div>
          <CopyBlock label="Analysis JSON (for the API)" text={JSON.stringify(analysis, null, 2)} rows={10} />
          <div className="callout info small"><b>What happens after each call.</b> Vaani posts <code>call_postprocessing</code>. The app parses the transcript, re-extracts every field with its own rules (Vaani&apos;s data only fills gaps), qualifies against qualified.md, flags any rupee figure the agent said that isn&apos;t in pricing.md, then sends the Telegram + Calendly handoff or a review task. Callers who hang up before speaking become call-back tasks.</div>
        </div>
      </div>
    </div>
  );
}
