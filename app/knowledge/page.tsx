import Link from "next/link";
import { getKB, proseOf } from "@/lib/knowledge";
import { Markdown } from "@/components/Markdown";

export const dynamic = "force-dynamic";

export default async function Knowledge({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f = "qualified" } = await searchParams;
  const kb = getKB();
  const files = { services: kb.services, pricing: kb.pricing, qualified: kb.qualified } as const;
  const cur = files[(f in files ? f : "qualified") as keyof typeof files];
  const q = kb.qualified.data;
  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">System</div><h1>Knowledge sources</h1><p>The agent may only say what these files say. Each file holds the human-readable version and a machine-readable block the engine actually evaluates — one source of truth, versioned in Git.</p></div>
      </div>
      <div className="callout" style={{ marginBottom: 18 }}><b>DEMO DATA.</b> All three files are mock content written for the prototype. Replace them with Aangan&apos;s real services, rates and Nikhil&apos;s own criteria before going live.</div>
      <div className="tabs">
        {Object.entries(files).map(([k, v]) => <Link key={k} href={`/knowledge?f=${k}`} className={cur === v ? "on" : ""}>{v.file} <span className="tiny muted mono">#{v.hash}</span></Link>)}
      </div>
      <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)", alignItems: "start" }}>
        <div className="card card-pad"><Markdown md={proseOf(cur.markdown)} /></div>
        <div className="stack">
          {cur === kb.qualified && (
            <div className="card card-pad">
              <div className="eyebrow" style={{ marginBottom: 10 }}>What the engine evaluates</div>
              <div className="rules">{q.rules.map((r) => <div key={r.id} className="rule SKIP"><span className="id">{r.id}</span><span className="res" style={{ color: "var(--indigo)" }}>{r.type}</span><span>{r.name}{r.onFail && <span className="src">on fail → {String(r.onFail)}</span>}</span></div>)}</div>
              <p className="small" style={{ marginTop: 12 }}>Required before a confident decision: <b>{q.requiredFields.join(", ")}</b>. Confidence threshold <b>{q.confidenceThreshold}</b>. High value (never auto-rejected): ₹{(q.highValue.minBudget / 1e5).toFixed(0)} L+ or {q.highValue.minSqft.toLocaleString("en-IN")} sq ft+.</p>
              <p className="tiny muted">A rule type with no evaluator returns UNKNOWN → human review. The engine never fills a gap with its own criteria.</p>
            </div>
          )}
          {cur === kb.services && (
            <div className="card card-pad">
              <div className="eyebrow" style={{ marginBottom: 10 }}>Index</div>
              <div className="small"><b>{kb.services.data.provided.length}</b> provided · <b>{kb.services.data.excluded.length}</b> excluded · <b>{kb.services.data.faq.length}</b> permitted answers</div>
              <p className="tiny muted" style={{ marginTop: 8 }}>A service question that matches neither list is answered with &ldquo;I won&apos;t guess — the design team will confirm&rdquo; and logged as a knowledge gap.</p>
            </div>
          )}
          {cur === kb.pricing && (
            <div className="card card-pad">
              <div className="eyebrow" style={{ marginBottom: 10 }}>Guardrails</div>
              <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>
                <li>Ranges only; never &ldquo;your project will cost ₹X&rdquo;.</li>
                <li>No total without a carpet area.</li>
                <li>Every answer carries: <i>{kb.pricing.data.disclaimer}</i></li>
                <li>Requests for a final / exact / guaranteed price → pricing escalation.</li>
                <li>Any rupee figure not traceable to this file is rejected by <code>unapprovedAmounts()</code>.</li>
              </ul>
            </div>
          )}
          <details className="card collapse"><summary className="card-pad small">Machine-readable block ▸</summary><div style={{ padding: "0 20px 20px" }} className="md"><pre>{JSON.stringify(cur.data, null, 2)}</pre></div></details>
        </div>
      </div>
    </div>
  );
}
