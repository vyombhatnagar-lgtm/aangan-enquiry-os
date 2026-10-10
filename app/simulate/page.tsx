import { PhoneCall } from "@/components/PhoneCall";
import { TalkToAgent } from "@/components/TalkToAgent";
import { outboundConfigured } from "@/lib/vaani";

export const dynamic = "force-dynamic";

export default function TalkPage() {
  const ready = outboundConfigured();
  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div className="page-head">
        <div>
          <h1>Talk to the agent</h1>
          <p className="small muted">Real conversations with the live agent. Every call becomes an enquiry, and the numbers and insights are built from these calls.</p>
        </div>
      </div>
      <TalkToAgent ready={ready} />
      <PhoneCall ready={ready} />
    </div>
  );
}
