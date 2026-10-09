import { NextResponse } from "next/server";
import { ready } from "@/lib/db";
import { applyAction, type ActionInput } from "@/lib/actions";
import { appUrl } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await ready();
    const { id } = await ctx.params;
    const body = (await req.json()) as ActionInput;
    const lead = await applyAction(id, body, { deliver: true, appUrl: appUrl(req) });
    return NextResponse.json({ lead });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
