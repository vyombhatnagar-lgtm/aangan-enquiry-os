import { Simulator } from "@/components/Simulator";
import { PhoneCall } from "@/components/PhoneCall";
import { outboundConfigured } from "@/lib/vaani";
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
          <p className="small muted">Get a real call on your phone, run a sample call, or play the caller in the browser. Test calls are saved as demo enquiries.</p>
        </div>
      </div>
      <PhoneCall ready={outboundConfigured()} scenarios={scenarios.map(({ key, title, blurb }) => ({ key, title, blurb }))} />
      <h2 style={{ margin: "8px 0 12px" }}>In the browser</h2>
      <Simulator scenarios={scenarios} threshold={getKB().qualified.data.confidenceThreshold} />
    </div>
  );
}
