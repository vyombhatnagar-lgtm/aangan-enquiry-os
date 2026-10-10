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
          <h1>Test call</h1>
          <p className="small muted">Run a sample call or play the caller yourself. Test calls are saved as enquiries marked demo.</p>
        </div>
      </div>
      <Simulator scenarios={scenarios} threshold={getKB().qualified.data.confidenceThreshold} />
    </div>
  );
}
