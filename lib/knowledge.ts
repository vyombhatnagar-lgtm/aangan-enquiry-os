import fs from "node:fs";
import path from "node:path";

export interface ServiceEntry { id: string; label: string; keywords: string[]; propertyLevel?: boolean; maxSqft?: number }
export interface FaqEntry { id: string; keywords: string[]; answer: string }
export interface ServicesKB { provided: ServiceEntry[]; excluded: ServiceEntry[]; faq: FaqEntry[] }
export interface PriceRow { id: string; scope: string; tier: string; min: number; max: number }
export interface PackageRow { id: string; scope: string; label: string; min: number; max: number }
export interface PricingKB {
  disclaimer: string;
  perSqft: PriceRow[];
  packages: PackageRow[];
  defaultTierForBroadRange: Record<string, string[]>;
  roundTotalsTo: number;
}
export interface QualRule { id: string; name: string; type: string; onFail?: string; [k: string]: unknown }
export interface QualifiedKB {
  requiredFields: string[];
  confidenceThreshold: number;
  rules: QualRule[];
  highValue: { minBudget: number; minSqft: number; neverAutoReject: boolean };
  contradictions: { sqftPerBhk: Record<string, [number, number]> };
}

export interface KnowledgeSource<T> { file: string; markdown: string; data: T; hash: string }
export interface KnowledgeBase {
  services: KnowledgeSource<ServicesKB>;
  pricing: KnowledgeSource<PricingKB>;
  qualified: KnowledgeSource<QualifiedKB>;
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function load<T>(file: string): KnowledgeSource<T> {
  const p = path.join(process.cwd(), "knowledge", file);
  const markdown = fs.readFileSync(p, "utf8");
  const m = markdown.match(/```json\s*([\s\S]*?)```/);
  if (!m) throw new Error(`knowledge/${file} has no machine-readable json block`);
  return { file, markdown, data: JSON.parse(m[1]) as T, hash: hash(markdown) };
}

let cache: KnowledgeBase | null = null;
/**
 * Knowledge-base abstraction. Sources are markdown files with a machine-readable block,
 * so the human-readable rules and what the engine evaluates live in the same file.
 * Swap this loader for a DB/CMS/Drive source later without touching the engines.
 */
export function getKB(): KnowledgeBase {
  if (cache && process.env.NODE_ENV === "production") return cache;
  cache = {
    services: load<ServicesKB>("services.md"),
    pricing: load<PricingKB>("pricing.md"),
    qualified: load<QualifiedKB>("qualified.md"),
  };
  return cache;
}

/** Markdown with the json block removed — for display and for LLM grounding. */
export function proseOf(md: string) {
  return md.replace(/## Machine-readable[\s\S]*$/m, "").trim();
}
