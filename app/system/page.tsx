import { SecHead } from "@/components/ui";
import { ResetButton } from "@/components/ResetButton";
import { llmAvailable, AGENT_MODEL, EXTRACT_MODEL } from "@/lib/engine/llm";
import { telegramConfigured } from "@/lib/handoff";
import { calendlyConfigured, calendlyWebhookConfigured } from "@/lib/calendly";

export const dynamic = "force-dynamic";

const box = (t: string, sub?: string, tone: "ai" | "rule" | "human" | "io" | "biz" = "rule") => ({ t, sub, tone });
const PIPE = [
  box("Inbound phone call", "simulator · browser mic · telephony webhook", "io"),
  box("Call ingestion", "lib/live.ts · /api/calls/*", "io"),
  box("Conversation engine", "asks only missing slots, never twice", "ai"),
  box("Information extraction", "rules first, AI Gateway fills gaps", "ai"),
  box("Knowledge retrieval", "services.md · pricing.md · qualified.md", "rule"),
  box("Qualification engine", "R1–R5 from qualified.md only", "rule"),
  box("Pricing engine", "ranges from pricing.md + disclaimer", "rule"),
  box("Decision engine", "confidence < 0.7 → human", "rule"),
];
const TONE: Record<string, string> = { ai: "var(--indigo)", rule: "var(--ink-2)", human: "var(--ochre)", io: "var(--muted)", biz: "var(--terra)" };

function Box({ b }: { b: ReturnType<typeof box> }) {
  return <div style={{ border: `1px solid ${TONE[b.tone]}`, borderLeftWidth: 4, background: "var(--paper)", padding: "10px 14px", borderRadius: 4 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{b.t}</div>{b.sub && <div className="tiny muted mono" style={{ marginTop: 2 }}>{b.sub}</div>}</div>;
}
const Arrow = () => <div style={{ textAlign: "center", color: "var(--faint)", lineHeight: "18px" }}>↓</div>;

export default function SystemPage() {
  const llm = llmAvailable();
  const tg = telegramConfigured();
  const map: [string, string[]][] = [
    ["Trigger", ["Incoming phone call (24 × 7)"]],
    ["Input", ["Caller conversation (speech → text)", "Caller number, time of call"]],
    ["Context", ["services.md", "pricing.md", "qualified.md", "Conversation history (this call)", "Lead history (Postgres)"]],
    ["Processing", ["Transcription", "Extraction", "Missing-information detection", "Qualification", "Pricing retrieval", "Confidence assessment", "Summarisation"]],
    ["AI", ["Conversational agent", "Information extraction (fills gaps rules miss)", "Qualification reasoning — explained against rules, not invented", "Summarisation for the designer"]],
    ["Human", ["Ambiguous cases", "Final design judgment and final pricing", "Project acceptance", "High-value interactions", "Every outcome: contacted, consultation, won/lost, value", "Overrides"]],
    ["Output", ["Customer response", "Indicative pricing guidance", "Qualification result", "Designer handoff (Telegram) with Calendly booking link", "Consultation stage synced from Calendly", "Dashboard metrics", "Cost / ROI metrics"]],
  ];
  const guard: [string, string][] = [
    ["Never fabricate pricing", "Pricing engine reads pricing.md only; unapprovedAmounts() rejects any ₹ figure not traceable to it"],
    ["Never provide a final quotation", "Quote / exact / guarantee requests → refusal + PRICING_ESCALATION event"],
    ["Never invent qualification rules", "Engine evaluates only rules declared in qualified.md; unknown rule types → UNKNOWN → human"],
    ["Never reject an ambiguous lead with high confidence", "Doubt lowers confidence; < threshold → NEEDS_HUMAN_REVIEW; high-value fails → human"],
    ["Never hide AI uncertainty", "Confidence, rule trace, missing fields and review reasons on every lead"],
    ["Response time ≠ revenue", "Leading and lagging indicators labelled separately on every page"],
    ["Never fabricate ROI", "ROI labelled 'cannot yet be causally established' unless baseline is real, randomised and significant"],
    ["Only humans record wins", "won/lost actions require a named person and a value; the AI has no code path to them"],
    ["Never lose the conversation", "Transcript written to Postgres every turn, including dropped and failed calls"],
    ["Telegram is not the record", "Handoff message is a copy; lead record, audit trail and transcript live in Postgres"],
    ["No WhatsApp in this version", "Only the PHONE channel exists; adapters post to the same pipeline later"],
    ["Bookings tie back to the right lead", "Calendly link carries utm_campaign = lead id; webhook signatures verified (HMAC-SHA256, 3-min replay window); unmatched bookings raise a warning"],
    ["Human override always", "Every lead can be overridden with a reason; overrides feed the failure dashboard"],
  ];
  return (
    <div className="page">
      <div className="page-head">
        <div><div className="eyebrow">System</div><h1>How it works</h1><p>AI does the talking, extracting and summarising. Explicit rules decide. People handle ambiguity, pricing, projects and every outcome that counts as revenue.</p></div>
        <ResetButton />
      </div>

      <div className="grid g4" style={{ marginBottom: 8 }}>
        <div className="card stat"><div className="label">Database</div><div className="value" style={{ fontSize: 20 }}>Neon Postgres</div><div className="sub">system of record</div></div>
        <div className="card stat"><div className="label">AI Gateway</div><div className="value" style={{ fontSize: 20, color: llm ? "var(--sage)" : "var(--ochre)" }}>{llm ? "connected" : "not configured"}</div><div className="sub mono">{EXTRACT_MODEL} · {AGENT_MODEL}</div></div>
        <div className="card stat"><div className="label">Telegram</div><div className="value" style={{ fontSize: 20, color: tg ? "var(--sage)" : "var(--ochre)" }}>{tg ? "live" : "simulated"}</div><div className="sub">designer notification layer</div></div>
        <div className="card stat"><div className="label">Calendly</div><div className="value" style={{ fontSize: 20, color: calendlyWebhookConfigured() ? "var(--sage)" : "var(--ochre)" }}>{calendlyWebhookConfigured() ? "synced" : calendlyConfigured() ? "link only" : "demo link"}</div><div className="sub">consultation booking + webhook</div></div>
      </div>

      <section className="sec">
        <SecHead eyebrow="Journey" title="Before and after" />
        <div className="grid g2">
          <div className="card card-pad">
            <h3 style={{ marginBottom: 12 }}>Today</h3>
            {["Customer", "Inbound phone call", "Front desk (10 AM – 7 PM)", "Basic questions", "Front-desk judgment", "Forward to designer (often without context)", "Designer repeats the questions", "Consultation", "Project / no project", "Revenue"].map((s, i, a) => <div key={s}><Box b={box(s, undefined, i === 2 || i === 4 || i === 6 ? "human" : "io")} />{i < a.length - 1 && <Arrow />}</div>)}
            <p className="small" style={{ color: "var(--brick)", marginTop: 12 }}>~33% of calls arrive out of hours · ~48% get no reply within 48 h · an answer within 1 h converts ~4× better than next-day.</p>
          </div>
          <div className="card card-pad">
            <h3 style={{ marginBottom: 12 }}>With the Enquiry OS</h3>
            {PIPE.map((b, i) => <div key={b.t}><Box b={b} /><Arrow /></div>)}
            <div className="grid g3" style={{ gap: 8 }}>
              <Box b={box("Qualified", "→ Telegram handoff", "biz")} />
              <Box b={box("Needs review", "→ review task", "human")} />
              <Box b={box("Not qualified", "→ polite answer", "io")} />
            </div>
            <Arrow />
            {["Designer (with full context)", "Calendly booking link → consultation booked (webhook updates the lead)", "Project — recorded by a person", "Analytics: conversion, revenue, cost, ROI"].map((s, i, a) => <div key={s}><Box b={box(s, undefined, i === 3 ? "biz" : "human")} />{i < a.length - 1 && <Arrow />}</div>)}
          </div>
        </div>
        <div className="row tiny muted" style={{ marginTop: 10, gap: 16 }}>
          <span><span style={{ color: TONE.ai }}>■</span> AI</span><span><span style={{ color: TONE.rule }}>■</span> explicit rules</span><span><span style={{ color: TONE.human }}>■</span> human</span><span><span style={{ color: TONE.biz }}>■</span> business outcome</span>
        </div>
      </section>

      <section className="sec">
        <SecHead eyebrow="Components map" />
        <div className="card tbl-wrap"><table className="tbl"><tbody>{map.map(([k, v]) => <tr key={k}><td style={{ width: 140 }}><b>{k}</b></td><td>{v.join(" · ")}</td></tr>)}</tbody></table></div>
      </section>

      <section className="sec">
        <SecHead eyebrow="Guardrails" title="Non-negotiables, and where each is enforced" />
        <div className="card tbl-wrap"><table className="tbl"><thead><tr><th>#</th><th>Guardrail</th><th>Enforcement</th></tr></thead><tbody>{guard.map(([g, e], i) => <tr key={g}><td className="mono muted">{i + 1}</td><td><b style={{ fontWeight: 500 }}>{g}</b></td><td className="small ink2">{e}</td></tr>)}</tbody></table></div>
      </section>

      <section className="sec">
        <SecHead eyebrow="Extending" title="Channels later, same pipeline" />
        <div className="card card-pad small ink2">
          Telephony providers (Exotel, Plivo, Twilio India SIP, or Vapi with an Indian DID) post finished transcripts to <code>/api/calls/inbound</code>, or stream turns to <code>/api/calls/live</code>. WhatsApp and web forms would be two more adapters calling the same extraction → qualification → handoff pipeline. They are deliberately not built in this version.
        </div>
      </section>
    </div>
  );
}
