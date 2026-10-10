import { Pool, type PoolClient } from "pg";
import type { AuditEvent, Baseline, Call, Lead, Override } from "../types";

declare global { var __aanganPool: Pool | undefined; var __aanganReady: Promise<void> | undefined }

function connString() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_PRISMA_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Connect a Neon database in Vercel → Storage, or add it to .env.local.");
  return url;
}

export function pool(): Pool {
  if (!globalThis.__aanganPool) {
    const url = connString();
    const local = /localhost|127\.0\.0\.1/.test(url);
    globalThis.__aanganPool = new Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false }, max: 5, idleTimeoutMillis: 10_000 });
  }
  return globalThis.__aanganPool;
}

const DDL = `
CREATE TABLE IF NOT EXISTS leads (
  id text PRIMARY KEY,
  enquiry_at timestamptz NOT NULL,
  status text NOT NULL,
  ai_decision text,
  decision text,
  confidence numeric,
  high_value boolean DEFAULT false,
  after_hours boolean DEFAULT false,
  cohort text NOT NULL DEFAULT 'AUTOMATION',
  handoff_status text NOT NULL DEFAULT 'NOT_SENT',
  consultation_status text NOT NULL DEFAULT 'NOT_SCHEDULED',
  project_outcome text NOT NULL DEFAULT 'PENDING',
  project_value bigint,
  ai_cost numeric DEFAULT 0,
  response_time_seconds numeric,
  designer_assigned text,
  is_demo boolean DEFAULT false,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leads_enquiry_at ON leads (enquiry_at DESC);
CREATE TABLE IF NOT EXISTS calls (
  id text PRIMARY KEY,
  lead_id text REFERENCES leads(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL,
  status text NOT NULL,
  after_hours boolean DEFAULT false,
  duration_sec numeric,
  cost_total numeric DEFAULT 0,
  live boolean DEFAULT false,
  data jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS calls_started ON calls (started_at DESC);
CREATE TABLE IF NOT EXISTS audit_events (
  id bigserial PRIMARY KEY,
  lead_id text,
  call_id text,
  at timestamptz NOT NULL,
  type text NOT NULL,
  actor text NOT NULL,
  severity text NOT NULL DEFAULT 'info',
  message text NOT NULL,
  data jsonb
);
CREATE INDEX IF NOT EXISTS audit_lead ON audit_events (lead_id, at);
CREATE INDEX IF NOT EXISTS audit_type ON audit_events (type);
CREATE TABLE IF NOT EXISTS overrides (
  id bigserial PRIMARY KEY,
  lead_id text NOT NULL,
  original_ai_status text NOT NULL,
  human_status text NOT NULL,
  reason text NOT NULL,
  user_name text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS baseline (id int PRIMARY KEY, data jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS meta (key text PRIMARY KEY, value jsonb);
`;

export async function ready() {
  if (!globalThis.__aanganReady) {
    globalThis.__aanganReady = (async () => {
      const c = await pool().connect();
      try {
        // one transaction + xact lock: safe behind Neon's pooled (pgbouncer) endpoint and with concurrent cold starts
        await c.query("BEGIN");
        await c.query("SELECT pg_advisory_xact_lock(424242)");
        await c.query(DDL);
        const { rows } = await c.query("SELECT value FROM meta WHERE key='seeded'");
        if (!rows.length) {
          const { seedDemo } = await import("../seed/seed");
          await seedDemo(c);
          await c.query("INSERT INTO meta (key, value) VALUES ('seeded', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [JSON.stringify({ at: new Date().toISOString() })]);
        }
        await c.query("COMMIT");
      } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
    })().catch((e) => { globalThis.__aanganReady = undefined; throw e; });
  }
  return globalThis.__aanganReady;
}

type Q = Pool | PoolClient;
async function db(): Promise<Pool> { await ready(); return pool(); }

// ---------- leads ----------
export async function saveLead(l: Lead, q?: Q) {
  const c = q ?? (await db());
  l.updatedAt = new Date().toISOString();
  await c.query(
    `INSERT INTO leads (id, enquiry_at, status, ai_decision, decision, confidence, high_value, after_hours, cohort, handoff_status, consultation_status, project_outcome, project_value, ai_cost, response_time_seconds, designer_assigned, is_demo, data, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     ON CONFLICT (id) DO UPDATE SET enquiry_at=$2, status=$3, ai_decision=$4, decision=$5, confidence=$6, high_value=$7, after_hours=$8, cohort=$9, handoff_status=$10, consultation_status=$11, project_outcome=$12, project_value=$13, ai_cost=$14, response_time_seconds=$15, designer_assigned=$16, is_demo=$17, data=$18, updated_at=$20`,
    [l.id, l.enquiryAt, l.status, l.aiDecision ?? null, l.decision ?? null, l.confidenceScore ?? null, l.highValue, l.afterHours, l.cohort, l.designerHandoffStatus, l.consultationStatus, l.projectOutcome, l.projectValue ?? null, l.aiCost, l.responseTimeSeconds ?? null, l.designerAssigned ?? null, l.isDemo, JSON.stringify(l), l.createdAt, l.updatedAt],
  );
}

function rowToLead(r: { data: Lead }): Lead { return r.data; }

export async function listLeads(): Promise<Lead[]> {
  const { rows } = await (await db()).query("SELECT data FROM leads ORDER BY enquiry_at DESC");
  return rows.map(rowToLead);
}
export async function getLead(id: string): Promise<Lead | null> {
  const { rows } = await (await db()).query("SELECT data FROM leads WHERE id=$1", [id]);
  return rows[0] ? rowToLead(rows[0]) : null;
}

// ---------- calls ----------
export async function saveCall(c: Call & { live?: boolean; agentState?: unknown }, q?: Q) {
  const cl = q ?? (await db());
  await cl.query(
    `INSERT INTO calls (id, lead_id, started_at, status, after_hours, duration_sec, cost_total, live, data) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO UPDATE SET lead_id=$2, status=$4, duration_sec=$6, cost_total=$7, live=$8, data=$9`,
    [c.id, c.leadId, c.startedAt, c.status, c.afterHours, c.durationSec, c.cost.total, !!c.live, JSON.stringify(c)],
  );
}
export async function listCalls(): Promise<Call[]> {
  const { rows } = await (await db()).query("SELECT data FROM calls ORDER BY started_at DESC");
  return rows.map((r) => r.data);
}
export async function getCall(id: string): Promise<(Call & { live?: boolean; agentState?: unknown }) | null> {
  const { rows } = await (await db()).query("SELECT data FROM calls WHERE id=$1", [id]);
  return rows[0]?.data ?? null;
}
export async function callsForLead(leadId: string): Promise<Call[]> {
  const { rows } = await (await db()).query("SELECT data FROM calls WHERE lead_id=$1 ORDER BY started_at", [leadId]);
  return rows.map((r) => r.data);
}

// ---------- audit ----------
export async function audit(e: AuditEvent, q?: Q) {
  const c = q ?? (await db());
  await c.query("INSERT INTO audit_events (lead_id, call_id, at, type, actor, severity, message, data) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
    [e.leadId, e.callId ?? null, e.at, e.type, e.actor, e.severity ?? "info", e.message, e.data ? JSON.stringify(e.data) : null]);
}
export async function auditFor(leadId: string): Promise<AuditEvent[]> {
  const { rows } = await (await db()).query("SELECT id, lead_id, call_id, at, type, actor, severity, message, data FROM audit_events WHERE lead_id=$1 ORDER BY at, id", [leadId]);
  return rows.map(mapAudit);
}
export async function auditAll(types?: string[]): Promise<AuditEvent[]> {
  const c = await db();
  const { rows } = types
    ? await c.query("SELECT id, lead_id, call_id, at, type, actor, severity, message, data FROM audit_events WHERE type = ANY($1) ORDER BY at DESC, id DESC", [types])
    : await c.query("SELECT id, lead_id, call_id, at, type, actor, severity, message, data FROM audit_events ORDER BY at DESC, id DESC LIMIT 500");
  return rows.map(mapAudit);
}
function mapAudit(r: Record<string, unknown>): AuditEvent {
  return { id: Number(r.id), leadId: r.lead_id as string, callId: r.call_id as string, at: new Date(r.at as string).toISOString(), type: r.type as string, actor: r.actor as string, severity: r.severity as AuditEvent["severity"], message: r.message as string, data: (r.data as Record<string, unknown>) ?? undefined };
}

// ---------- overrides ----------
export async function saveOverride(o: Override, q?: Q) {
  const c = q ?? (await db());
  await c.query("INSERT INTO overrides (lead_id, original_ai_status, human_status, reason, user_name, at) VALUES ($1,$2,$3,$4,$5,$6)", [o.leadId, o.originalAIStatus, o.humanStatus, o.reason, o.user, o.timestamp]);
}
export async function listOverrides(leadId?: string): Promise<Override[]> {
  const c = await db();
  const { rows } = leadId ? await c.query("SELECT * FROM overrides WHERE lead_id=$1 ORDER BY at DESC", [leadId]) : await c.query("SELECT * FROM overrides ORDER BY at DESC");
  return rows.map((r) => ({ leadId: r.lead_id, originalAIStatus: r.original_ai_status, humanStatus: r.human_status, reason: r.reason, user: r.user_name, timestamp: new Date(r.at).toISOString() }));
}

// ---------- baseline ----------
export async function getBaseline(): Promise<Baseline | null> {
  const { rows } = await (await db()).query("SELECT data FROM baseline WHERE id=1");
  return rows[0]?.data ?? null;
}
export async function saveBaseline(b: Baseline, q?: Q) {
  const c = q ?? (await db());
  await c.query("INSERT INTO baseline (id, data) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET data=$1", [JSON.stringify(b)]);
}

const DELETE_DEMO = `
  DELETE FROM audit_events WHERE lead_id IN (SELECT id FROM leads WHERE is_demo);
  DELETE FROM overrides WHERE lead_id IN (SELECT id FROM leads WHERE is_demo);
  DELETE FROM calls WHERE lead_id IN (SELECT id FROM leads WHERE is_demo);
  DELETE FROM leads WHERE is_demo;
  DELETE FROM baseline WHERE data->>'source' = 'DEMO_ASSUMPTION';`;

/** Re-seed the demo data. Only demo rows are touched; real enquiries are never deleted. */
export async function resetDemo() {
  const c = await pool().connect();
  try {
    await c.query("BEGIN");
    await c.query(DELETE_DEMO);
    await c.query("DELETE FROM meta WHERE key='seeded'");
    const { seedDemo } = await import("../seed/seed");
    const { rows } = await c.query("SELECT 1 FROM baseline WHERE id=1");
    await seedDemo(c, { keepBaseline: rows.length > 0 });
    await c.query("INSERT INTO meta (key, value) VALUES ('seeded', $1)", [JSON.stringify({ at: new Date().toISOString() })]);
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
}

/** Go live: remove every demo row and stop the demo from re-seeding. Real enquiries are kept. */
export async function clearDemo() {
  const c = await pool().connect();
  try {
    await c.query("BEGIN");
    await c.query(DELETE_DEMO);
    await c.query("INSERT INTO meta (key, value) VALUES ('seeded', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [JSON.stringify({ cleared: new Date().toISOString() })]);
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
}

// ---------- meta (small key/value: webhook correlation, flags) ----------
export async function getMeta<T = unknown>(key: string): Promise<T | null> {
  const { rows } = await (await db()).query("SELECT value FROM meta WHERE key=$1", [key]);
  return (rows[0]?.value as T) ?? null;
}
export async function setMeta(key: string, value: unknown) {
  await (await db()).query("INSERT INTO meta (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2", [key, JSON.stringify(value)]);
}
