import { Simulator } from "@/components/Simulator";
import { SCENARIOS } from "@/lib/seed/personas";
import { getKB } from "@/lib/knowledge";

export const dynamic = "force-dynamic";

export default function SimulatePage() {
  const scenarios = Object.entries(SCENARIOS).map(([key, s]) => ({ key, title: s.title, expect: s.expect, blurb: s.blurb }));
  return (
    <div className="page" style={{ maxWidth: 1480 }}>
      <div className="page-head">
        <div>
          <div className="eyebrow">Demo mode · live line</div>
          <h1>Simulate an incoming call</h1>
          <p>Each call creates a real enquiry: conversation, extraction, qualification against qualified.md, indicative pricing from pricing.md, a designer handoff or review task, and its cost. The dashboard updates as soon as it ends.</p>
        </div>
      </div>
      <Simulator scenarios={scenarios} threshold={getKB().qualified.data.confidenceThreshold} />
    </div>
  );
}
