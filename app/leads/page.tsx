import Link from "next/link";
import { listLeads } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { Money, Pill } from "@/components/ui";
import type { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUSES = ["NEW", "QUALIFIED", "NOT_QUALIFIED", "NEEDS_HUMAN_REVIEW", "DESIGNER_CONTACTED", "CONSULTATION", "PROJECT_WON", "PROJECT_LOST"];

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const all = await listLeads();
  const designers = [...new Set(all.map((l) => l.designerAssigned).filter(Boolean))] as string[];
  const f = (l: Lead) =>
    (!sp.status || l.status === sp.status) &&
    (!sp.qualified || (sp.qualified === "yes" ? l.decision === "QUALIFIED" : sp.qualified === "no" ? l.decision === "NOT_QUALIFIED" : l.decision === "NEEDS_HUMAN_REVIEW")) &&
    (!sp.designer || l.designerAssigned === sp.designer) &&
    (!sp.outcome || l.projectOutcome === sp.outcome) &&
    (!sp.afterHours || (sp.afterHours === "yes" ? l.afterHours : !l.afterHours)) &&
    (!sp.from || l.enquiryDate >= sp.from) &&
    (!sp.to || l.enquiryDate <= sp.to) &&
    (!sp.q || `${l.customerName} ${l.phoneNumber} ${l.location} ${l.id}`.toLowerCase().includes(sp.q.toLowerCase()));
  const leads = all.filter(f);
  const active = Object.values(sp).some(Boolean);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Enquiries</h1>
          <div className="small muted">Every inbound call, including missed ones.</div>
        </div>
        <Link href="/simulate" className="btn terra">Simulate incoming call</Link>
      </div>

      <form className="card card-pad" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, alignItems: "end", marginBottom: 18 }}>
        <label className="field">Search<input name="q" defaultValue={sp.q} placeholder="Name, phone, area" /></label>
        <label className="field">Status<select name="status" defaultValue={sp.status ?? ""}><option value="">Any</option>{STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ").toLowerCase()}</option>)}</select></label>
        <label className="field">Qualified<select name="qualified" defaultValue={sp.qualified ?? ""}><option value="">Any</option><option value="yes">Qualified</option><option value="no">Not qualified</option><option value="review">Needs review</option></select></label>
        <label className="field">Designer<select name="designer" defaultValue={sp.designer ?? ""}><option value="">Any</option>{designers.map((d) => <option key={d}>{d}</option>)}</select></label>
        <label className="field">Outcome<select name="outcome" defaultValue={sp.outcome ?? ""}><option value="">Any</option><option value="PENDING">Pending</option><option value="WON">Won</option><option value="LOST">Lost</option></select></label>
        <label className="field">After hours<select name="afterHours" defaultValue={sp.afterHours ?? ""}><option value="">Any</option><option value="yes">After hours</option><option value="no">Office hours</option></select></label>
        <label className="field">From<input type="date" name="from" defaultValue={sp.from} /></label>
        <label className="field">To<input type="date" name="to" defaultValue={sp.to} /></label>
        <div className="row" style={{ gap: 6 }}><button className="btn primary" type="submit">Filter</button>{active && <Link className="btn ghost" href="/leads">Clear</Link>}</div>
      </form>

      <div className="small muted" style={{ marginBottom: 8 }}>{leads.length} of {all.length} enquiries</div>
      <div className="card tbl-wrap">
        <table className="tbl">
          <thead><tr><th>Received</th><th>Customer</th><th>Project</th><th className="r">Area</th><th>Budget</th><th>Result</th><th>Stage</th><th>Designer</th><th className="r">Value</th></tr></thead>
          <tbody>
            {leads.map((l) => (
              <tr key={l.id}>
                <td className="mono" style={{ whiteSpace: "nowrap" }}>{fmtDate(l.enquiryAt)}{l.afterHours && <div><span className="badge ah">after hours</span></div>}</td>
                <td><Link className="rowlink" href={`/leads/${l.id}`}>{l.customerName ?? "Unknown caller"}</Link>{l.highValue && <> <span className="badge hv">HV</span></>}{l.callClass && l.callClass !== "ENQUIRY" && <> <span className="badge">{l.callClass === "EXISTING_CLIENT" ? "existing client" : "not an enquiry"}</span></>}<div className="tiny muted mono">{l.phoneNumber}</div></td>
                <td className="small">{l.projectType ?? "—"}{l.location && <div className="tiny muted">{l.location}</div>}</td>
                <td className="r small">{l.approximateArea ? l.approximateArea.toLocaleString("en-IN") : "—"}</td>
                <td className="small">{l.budget ?? "—"}</td>
                <td><Pill s={l.decision ?? "NEW"} />{l.confidenceScore != null && <div className="tiny muted mono" style={{ marginTop: 3 }}>{Math.round(l.confidenceScore * 100)}%</div>}</td>
                <td><Pill s={l.status} />{l.decision !== l.aiDecision && l.aiDecision && <div className="tiny" style={{ color: "var(--amber)", marginTop: 3 }}>changed by staff</div>}</td>
                <td className="small">{l.designerAssigned ?? "—"}</td>
                <td className="r"><Money v={l.projectValue} short /></td>
              </tr>
            ))}
            {!leads.length && <tr><td colSpan={9} className="empty-state">No enquiries match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
