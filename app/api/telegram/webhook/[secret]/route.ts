import { NextResponse } from "next/server";
import { ready } from "@/lib/db";
import { applyAction } from "@/lib/actions";

export const dynamic = "force-dynamic";

/** Telegram inline-button callbacks: ✅ Acknowledge / 📞 Contacted. Set with setWebhook to /api/telegram/webhook/<TELEGRAM_WEBHOOK_SECRET>. */
export async function POST(req: Request, ctx: { params: Promise<{ secret: string }> }) {
  const { secret } = await ctx.params;
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) return NextResponse.json({ ok: false }, { status: 401 });
  await ready();
  const u = (await req.json()) as { callback_query?: { id: string; data?: string; from?: { first_name?: string; username?: string } } };
  const cq = u.callback_query;
  if (cq?.data) {
    const [action, leadId] = cq.data.split(":");
    const user = `${cq.from?.first_name ?? cq.from?.username ?? "Designer"} (Telegram)`;
    let text = "Recorded";
    try { await applyAction(leadId, { action: action === "contacted" ? "contacted" : "acknowledge", user }); } catch (e) { text = (e as Error).message; }
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ callback_query_id: cq.id, text }) }).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
