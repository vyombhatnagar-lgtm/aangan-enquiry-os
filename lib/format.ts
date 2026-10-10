export const TZ = "Asia/Kolkata";

/** Indian digit grouping: 1050000 -> ₹10,50,000 */
export function inr(n: number | null | undefined, opts: { dp?: number } = {}) {
  if (n == null || Number.isNaN(n)) return "—";
  const neg = n < 0;
  const dp = opts.dp ?? 0;
  const fixed = Math.abs(n).toFixed(dp);
  const [int, frac] = fixed.split(".");
  let out = int;
  if (int.length > 3) {
    const last3 = int.slice(-3);
    const rest = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    out = rest + "," + last3;
  }
  return (neg ? "−₹" : "₹") + out + (frac ? "." + frac : "");
}

/** Compact: 1050000 -> ₹10.5 L, 12500000 -> ₹1.25 Cr */
export function inrShort(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  const a = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (a >= 1e7) return `${sign}₹${trim(a / 1e7, 2)} Cr`;
  if (a >= 1e5) return `${sign}₹${trim(a / 1e5, 1)} L`;
  if (a >= 1e3) return `${sign}₹${trim(a / 1e3, 1)}k`;
  return `${sign}₹${trim(a, a < 10 ? 2 : 0)}`;
}

/** Spoken form for the voice agent: 1050000 -> "10.5 lakh" */
export function lakhWords(n: number) {
  if (n >= 1e7) return `${trim(n / 1e7, 2)} crore`;
  return `${trim(n / 1e5, 1)} lakh`;
}

function trim(x: number, dp: number) {
  return Number(x.toFixed(dp)).toString();
}

export function pct(x: number | null | undefined, dp = 1) {
  if (x == null || !Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(dp)}%`;
}

export function pp(x: number | null | undefined, dp = 1) {
  if (x == null || !Number.isFinite(x)) return "—";
  const v = x * 100;
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(dp)} pp`;
}

export function istParts(iso: string | Date) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const f = new Intl.DateTimeFormat("en-IN", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short",
  }).formatToParts(d);
  const get = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour") === "24" ? "00" : get("hour")}:${get("minute")}`,
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    weekday: get("weekday"),
    month: Number(get("month")),
    year: Number(get("year")),
  };
}

/** Front desk: 10:00–19:00 Mon–Sat IST. */
export function isAfterHours(iso: string | Date) {
  const p = istParts(iso);
  if (p.weekday.startsWith("Sun")) return true;
  return p.hour < 10 || p.hour >= 19;
}

export function fmtDate(iso?: string | null, withTime = true) {
  if (!iso) return "—";
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TZ, day: "numeric", month: "short",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(d);
}

export function fmtTime(iso?: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

export function duration(sec?: number | null) {
  if (sec == null) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.round((sec % 3600) / 60)}m`;
  return `${(sec / 86400).toFixed(1)}d`;
}

export function titleCase(s: string) {
  return s.replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

/** Event types that describe internals rather than what happened to the customer. */
export const HIDDEN_EVENTS = new Set(["SOURCES_USED", "CALL_ANALYSED", "AI_EXTRACTION", "EXTRACTED"]);

/** Strip vendor, file and model names from text shown to studio staff. */
export function plain(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/\b(qualified|pricing|services)\.md\b/g, (_, k) => ({ qualified: "studio criteria", pricing: "the price list", services: "the services list" } as Record<string, string>)[k])
    .replace(/\bAI Gateway\b/g, "the assistant")
    .replace(/\b(anthropic|google)\/[\w.-]+/g, "")
    .replace(/\b(Claude|Gemini|Haiku|Sonnet)[\w .-]*?(?=[·,)\]]|$)/g, "")
    .replace(/\(heuristic[^)]*\)/gi, "")
    .replace(/\bheuristic\b/gi, "standard")
    .replace(/\bVaani\b/g, "phone line")
    .replace(/\bR\d:?\s+(?=[A-Z])/g, "")
    .replace(/criteria in studio criteria/g, "studio criteria")
    .replace(/\bAI result:\s*/g, "Result: ")
    .replace(/\bAI answered\b/g, "Answered")
    .replace(/\s*\(confidence [\d.]+\)/g, "")
    .replace(/\bNEEDS_HUMAN_REVIEW\b/g, "Needs review").replace(/\bNOT_QUALIFIED\b/g, "Not qualified").replace(/\bQUALIFIED\b/g, "Qualified")
    .replace(/\s{2,}/g, " ")
    .trim();
}
