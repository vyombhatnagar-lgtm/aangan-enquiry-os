import { NextResponse } from "next/server";
import { ready } from "@/lib/db";
import { llmAvailable } from "@/lib/engine/llm";
import { telegramConfigured } from "@/lib/handoff";

export const dynamic = "force-dynamic";
export async function GET() {
  let db = "ok";
  try { await ready(); } catch (e) { db = (e as Error).message; }
  return NextResponse.json({ db, llm: llmAvailable(), telegram: telegramConfigured() });
}
