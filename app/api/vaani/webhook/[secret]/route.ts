import { NextResponse } from "next/server";
import { audit, getCall, getMeta, ready, saveCall, saveLead, setMeta } from "@/lib/db";
import { ingestTranscript } from "@/lib/ingest";
import { getVaaniSecret, parseVaaniTranscript, type VaaniWebhook } from "@/lib/vaani";
import { appUrl } from "@/lib/data";
import { callCost } from "@/lib/costs";
import { isAfterHours, istParts } from "@/lib/format";
import type { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Room = { phone?: string; startedAt?: string; transfers?: { at: string; event: string; detail?: string }[]; endReason?: string; duration?: number };

/**
 * Vaani AI → Settings → Webhooks → https://<app>/api/vaani/webhook/<VAANI_WEBHOOK_SECRET>
 * Vaani doesn't document request signing, so the secret lives in the path.
 */
export async function POST(req: Request, ctx: { params: Promise<{ secret: string }> }) {
  const { secret } = await ctx.params;
  await ready();
  if (secret !== (await getVaaniSecret())) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const e = (await req.json()) as VaaniWebhook;
  const room = e.room_name ?? e.data?.room_name ?? e.call_id ?? e.data?.call_id ?? "unknown";
  const key = `vaani:${room}`;
  const r: Room = (await getMeta<Room>(key)) ?? {};
  const now = new Date().toISOString();

  switch (e.event) {
    case "call_started":
      await setMeta(key, { ...r, phone: e.phone_number ?? r.phone, startedAt: r.startedAt ?? now });
      return NextResponse.json({ ok: true });
    case "user_picked_up_at":
      return NextResponse.json({ ok: true });
    case "human_transfer_initiated": case "human_transfer_successful": case "human_transfer_failed":
      await setMeta(key, { ...r, transfers: [...(r.transfers ?? []), { at: now, event: e.event, detail: (e as unknown as Record<string, unknown>).reason as string | undefined }] });
      return NextResponse.json({ ok: true });
    case "call_ended":
      await setMeta(key, { ...r, endReason: e.end_reason, duration: e.call_duration });
      return NextResponse.json({ ok: true });
    case "call_failed":
      await audit({ leadId: null, at: now, type: "CALL_FAILED", actor: "Vaani AI", severity: "error", message: `Vaani call failed: ${e.error ?? "unknown"}`, data: { room } });
      return NextResponse.json({ ok: true });
    case "call_postprocessing": {
      const d = e.data ?? {};
      const callId = `VAANI-${d.call_id ?? e.call_id ?? room}`;
      if (await getCall(callId)) return NextResponse.json({ ok: true, duplicate: true }); // idempotent on retries
      const durationSec = d.call_duration != null ? d.call_duration / 1000 : r.duration ?? 0;
      const startedAt = r.startedAt ? new Date(r.startedAt) : new Date(Date.now() - durationSec * 1000);
      const phone = r.phone ?? "unknown (Vaani)";
      let turns = parseVaaniTranscript(d.transcript as never);
      if (turns.length) { const t0 = turns[0].at; turns = turns.map((t) => ({ ...t, at: Math.max(0, t.at - t0) + 1.5 })); }
      const callerTurns = turns.filter((t) => t.speaker === "caller").length;
      if (callerTurns === 0) {
        // hung up before saying anything: still an enquiry until someone calls back
        const p = istParts(startedAt); const id = `AGN-${p.date.slice(2).replace(/-/g, "")}-V${String(Date.now()).slice(-4)}`;
        const lead: Lead = { id, phoneNumber: phone, enquiryDate: p.date, enquiryTime: p.time, enquiryAt: startedAt.toISOString(), source: "PHONE", requirements: [], servicesRequested: [], servicesExcluded: [], status: "NEW", ruleTrace: [], missingFields: ["everything"], reviewReasons: [`Caller hung up before speaking (${d.end_reason ?? r.endReason ?? "no reason"})`], qualificationReason: "Caller hung up — no conversation", recommendedAction: "Call the number back — this is a lost enquiry until someone does.", highValue: false, indicativePricingShown: false, designerHandoffStatus: "NOT_SENT", consultationStatus: "NOT_SCHEDULED", projectOutcome: "PENDING", responseTimeSeconds: turns[0]?.at ?? null, aiCost: 0, afterHours: isAfterHours(startedAt), cohort: "AUTOMATION", engine: "Vaani AI", isDemo: false, createdAt: now, updatedAt: now };
        const cost = callCost(turns.map((t) => ({ ...t })), { handoff: false, failed: true });
        lead.aiCost = cost.total;
        await saveLead(lead);
        await saveCall({ id: callId, leadId: id, phone, startedAt: startedAt.toISOString(), durationSec, status: "ABANDONED", failureReason: lead.reviewReasons[0], afterHours: lead.afterHours, transcript: turns, cost, engine: "Vaani AI" });
        await audit({ leadId: id, callId, at: startedAt.toISOString(), type: "CALL_ABANDONED", actor: "Vaani AI", severity: "error", message: lead.reviewReasons[0] });
        return NextResponse.json({ ok: true, leadId: id, abandoned: true });
      }
      const extraEvents = (r.transfers ?? []).map((t) => ({ type: t.event.toUpperCase(), message: `Vaani ${t.event.replace(/_/g, " ")}${t.detail ? `: ${t.detail}` : ""}`, offset: (new Date(t.at).getTime() - startedAt.getTime()) / 1000, severity: t.event.endsWith("failed") ? "error" as const : "info" as const }));
      if (d.recording_url) extraEvents.push({ type: "RECORDING", message: `Recording: ${d.recording_url}`, offset: durationSec, severity: "info" });
      const res = await ingestTranscript({ phone, startedAt, turns, entities: d.entities, summary: d.summary ? `${d.summary} (Vaani summary)` : undefined, engine: "Vaani AI", callId, durationSec, appUrl: appUrl(req), extraEvents });
      return NextResponse.json({ ok: true, leadId: res.lead.id, decision: res.lead.decision });
    }
    default:
      return NextResponse.json({ ok: true, ignored: e.event });
  }
}
