import { getKB } from "../knowledge";
import { titleCase } from "../format";
import type { Slot } from "../types";

/** Everything the agent knows during a call. Serializable (stored between live turns). */
export interface CallState {
  name?: string;
  bhk?: number;
  propertyType?: string;
  projectType?: string;
  projectScope?: string; // service id from services.md
  location?: string;
  inServiceArea?: boolean | null;
  area?: number;
  budgetText?: string;
  budgetMin?: number;
  budgetMax?: number;
  timelineText?: string;
  timelineMonths?: number;
  servicesRequested: string[];
  servicesExcluded: string[];
  requirements: string[];
  hedged: string[]; // slots answered vaguely ("around", "maybe")
  unclear: Slot[]; // asked but no usable answer
  asked: Slot[];
  corrections: { slot: string; from: string; to: string }[];
  contradictions: string[];
  pricingAsked: boolean;
  pricingPending: boolean;
  pricingGiven: boolean;
  pricingText?: string;
  pricingEscalations: string[];
  wantsHuman: boolean;
  faqAnswered: string[];
  kbRefs: string[];
  declined: boolean;
}

export function emptyState(): CallState {
  return {
    servicesRequested: [], servicesExcluded: [], requirements: [], hedged: [], unclear: [], asked: [],
    corrections: [], contradictions: [], pricingAsked: false, pricingPending: false, pricingGiven: false,
    pricingEscalations: [], wantsHuman: false, faqAnswered: [], kbRefs: [], declined: false,
  };
}

const WORDNUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, single: 1, a: 1, an: 1 };
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const OUTSIDE = ["navi mumbai", "mumbai", "thane", "nashik", "lonavala", "satara", "kolhapur", "nagpur", "bangalore", "bengaluru", "hyderabad", "goa", "aurangabad", "ahmednagar", "baramati", "alibag", "lavasa", "mahabaleshwar", "panchgani", "delhi", "gurgaon", "noida", "chennai", "solapur", "sangli"];
const HEDGE = /\b(around|about|roughly|approx|approximately|maybe|probably|i think|not exactly|something like|ish)\b/i;
const UNSURE = /\b(not sure|no idea|don'?t know|dont know|haven'?t decided|not decided|depends|let'?s see|can'?t say|no clue|you tell me|whatever it takes|flexible)\b/i;
const CORRECTION = /\b(actually|sorry|i mean|no wait|correction|let me correct|wait,? no|rather)\b/i;

const REQ_PATTERNS: [RegExp, string][] = [
  [/modular kitchen|kitchen/i, "Modular kitchen"],
  [/wardrobe|cupboard/i, "Wardrobes"],
  [/false ceiling|ceiling/i, "False ceiling"],
  [/lighting|lights/i, "Lighting design"],
  [/living( room)?|hall/i, "Living room"],
  [/master bed|bedrooms?/i, "Bedrooms"],
  [/kids'? ?room|children'?s room/i, "Kids' room"],
  [/pooja|mandir|puja/i, "Pooja unit"],
  [/study|home office|work from home/i, "Study / home office"],
  [/tv unit|tv wall|entertainment unit/i, "TV unit"],
  [/balcony/i, "Balcony"],
  [/automation|smart home/i, "Home automation"],
  [/conference|meeting room/i, "Conference room"],
  [/cabin/i, "Cabins"],
  [/reception/i, "Reception"],
  [/workstation|desks/i, "Workstations"],
  [/storage/i, "Storage"],
  [/dining/i, "Dining"],
  [/vastu/i, "Vastu-aware layout"],
];

function num(s: string) { return Number(s.replace(/,/g, "")); }

export function parseArea(t: string, hint?: Slot): number | undefined {
  const m = t.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:sq\.?\s*(?:ft|feet|foot)|sqft|sft|square\s*(?:feet|foot|ft))/i);
  if (m) return Math.round(num(m[1]));
  if (hint === "area") {
    const b = t.match(/\b(\d[\d,]{2,5})\b/);
    if (b) { const v = num(b[1]); if (v >= 150 && v <= 50000) return v; }
  }
  return undefined;
}

export function parseBhk(t: string): number | undefined {
  const m = t.match(/\b(\d)\s*-?\s*(?:bhk|b\.h\.k|bedroom)/i);
  if (m) return Number(m[1]);
  const w = t.match(/\b(one|two|three|four|five)\s*(?:-|\s)?(?:bhk|bedroom)/i);
  if (w) return WORDNUM[w[1].toLowerCase()];
  return undefined;
}

function toRupees(v: number, unit: string) {
  const u = unit.toLowerCase();
  if (u.startsWith("cr")) return v * 1e7;
  if (u.startsWith("k") || u.startsWith("thousand")) return v * 1e3;
  return v * 1e5; // lakh / lac / l
}

export function parseBudget(t: string, hint?: Slot): { min?: number; max?: number; text?: string; unsure?: boolean } | undefined {
  const U = "(lakhs?|lacs?|lakh|l\\b|crores?|cr\\b|k\\b|thousand)";
  const range = t.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:${U})?\\s*(?:-|–|to|and)\\s*(\\d+(?:\\.\\d+)?)\\s*${U}`, "i"));
  if (range) {
    const unitB = range[4];
    const unitA = range[2] || unitB;
    const a = toRupees(Number(range[1]), unitA), b = toRupees(Number(range[3]), unitB);
    return { min: Math.min(a, b), max: Math.max(a, b), text: range[0] };
  }
  const single = t.match(new RegExp(`(?:(under|below|less than|up ?to|max(?:imum)?|not more than|within)\\s*)?(?:rs\\.?|₹|inr)?\\s*(\\d+(?:\\.\\d+)?)\\s*${U}`, "i"));
  if (single) {
    const v = toRupees(Number(single[2]), single[3]);
    if (single[1]) return { min: undefined, max: v, text: single[0] };
    return { min: v, max: v, text: single[0] };
  }
  if (hint === "budget" && UNSURE.test(t)) return { unsure: true, text: t };
  return undefined;
}

export function parseTimeline(t: string, now: Date, hint?: Slot): { months?: number; text?: string; unsure?: boolean } | undefined {
  const s = t.toLowerCase();
  const curMonth = now.getUTCMonth();
  const hit = (re: RegExp) => s.match(re);
  // the stored text is the phrase that set the value, not the whole sentence
  const phrase = (m: RegExpMatchArray) => t.substr(m.index ?? 0, m[0].length).trim();
  let m: RegExpMatchArray | null;
  if ((m = hit(/\b(immediately|asap|right away|urgent(ly)?|this month|as soon as possible|already have possession|(just )?got (the )?possession|have possession|got the keys|ready to start)\b/))) return { months: 0.5, text: phrase(m) };
  if ((m = hit(/\b(possession|start|move in)?[^.,]{0,20}\bnext month\b/))) return { months: 1, text: phrase(m) };
  if ((m = hit(/\bafter diwali\b/))) return { months: 1.5, text: phrase(m) };
  if ((m = hit(/\b(end of (the|this) year|by december|year[- ]end)\b/))) return { months: Math.max(0.5, 11 - curMonth + 0.5), text: phrase(m) };
  if ((m = hit(/\b(early|start of|beginning of) next year\b/))) return { months: Math.max(1, 12 - curMonth + 1), text: phrase(m) };
  if ((m = hit(/\bnext year\b[^.]{0,20}/))) return { months: Math.max(6.5, 12 - curMonth + 3), text: phrase(m) };
  const n = s.match(/\b(?:in |within |about |around |maybe in )?(\d+(?:\.\d+)?|one|two|three|four|five|six|a|an)\s*(?:-|to)?\s*(?:\d+\s*)?(month|months|week|weeks|year|years)\b/);
  if (n) {
    const v = /^\d/.test(n[1]) ? Number(n[1]) : WORDNUM[n[1]] ?? 1;
    const unit = n[2];
    const months = unit.startsWith("week") ? v / 4 : unit.startsWith("year") ? v * 12 : v;
    return { months, text: phrase(n) };
  }
  for (let i = 0; i < 12; i++) {
    const re = new RegExp(`\\b(?:in|by|from|around|possession in|possession by|possession is in)\\s+${MONTHS[i]}\\b`);
    const mm = s.match(re);
    if (mm) {
      let diff = i - curMonth; if (diff <= 0) diff += 12;
      return { months: diff, text: phrase(mm) };
    }
  }
  if ((hint === "timeline") && (UNSURE.test(t) || /\b(just exploring|no rush|someday|eventually|just looking)\b/.test(s))) return { unsure: true, text: t };
  return undefined;
}

export function parseLocation(t: string, hint?: Slot): { location?: string; inServiceArea?: boolean | null } | undefined {
  const s = t.toLowerCase();
  const kb = getKB().qualified.data.rules.find((r) => r.type === "location");
  const area = ((kb?.serviceArea as string[]) ?? []).slice().sort((a, b) => b.length - a.length);
  const out = OUTSIDE.find((o) => new RegExp(`\\b${o}\\b`).test(s));
  const inn = area.find((a) => a !== "pune" && new RegExp(`\\b${a}\\b`).test(s)) ?? (/\bpune\b/.test(s) ? "pune" : undefined);
  if (out && inn) return { location: `${titleCase(inn)} / ${titleCase(out)} (unclear which is the site)`, inServiceArea: null };
  if (out) return { location: titleCase(out), inServiceArea: false };
  if (inn) return { location: inn === "pune" ? "Pune" : `${titleCase(inn)}, Pune`, inServiceArea: true };
  if (hint === "location") {
    if (UNSURE.test(t)) return undefined;
    const m = t.match(/\b(?:in|at|near)\s+([A-Za-z][A-Za-z ]{2,30})/);
    if (m) return { location: titleCase(m[1].trim()), inServiceArea: null };
  }
  return undefined;
}

const NAME_STOP = new Set(["it", "its", "s", "late", "early", "me", "calling", "speaking", "opening", "starting", "renovating", "shifting", "doing", "trying", "wondering", "having", "after", "about", "with", "for", "to", "looking", "calling", "interested", "planning", "not", "just", "the", "a", "here", "from", "moving", "getting", "sure", "fine", "good", "okay", "ok", "yes", "no", "hello", "hi", "thinking", "buying", "in", "at", "an", "also", "sorry"]);
export function parseName(t: string, hint?: Slot): string | undefined {
  const m = t.match(/\b(?:this is|my name is|my name's|name is|i am|i'm|myself)\s+([A-Za-z]+(?:\s+[A-Z][a-z]+)?)/i);
  if (m) {
    const first = m[1].split(/\s+/)[0];
    if (!NAME_STOP.has(first.toLowerCase()) && !/ing$/i.test(first) && /^[A-Za-z]{2,}$/.test(first)) return titleCase(m[1].toLowerCase().replace(/\s+(and|from|calling|here)\b.*$/, ""));
  }
  if (hint === "name") {
    const w = t.replace(/[^A-Za-z ]/g, " ").trim().split(/\s+/).filter((x) => !NAME_STOP.has(x.toLowerCase()));
    if (w.length >= 1 && w.length <= 3 && /^[A-Za-z]{2,}$/.test(w[0])) return titleCase(w.slice(0, 2).join(" ").toLowerCase());
  }
  return undefined;
}

export function matchServices(t: string) {
  const s = " " + t.toLowerCase() + " ";
  const { provided, excluded } = getKB().services.data;
  const hit = (k: string) => new RegExp(`(^|[^a-z])${k.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(s);
  const prov = provided.filter((e) => e.keywords.some(hit)).map((e) => e.id);
  const excl = excluded.filter((e) => e.keywords.some(hit));
  return { provided: prov, excluded: excl.map((e) => e.id), propertyLevel: excl.some((e) => e.propertyLevel) };
}

function propertyOf(t: string): string | undefined {
  const s = t.toLowerCase();
  if (/\bpenthouse\b/.test(s)) return "Penthouse";
  if (/\bvilla\b/.test(s)) return "Villa";
  if (/\bbungalow\b/.test(s)) return "Bungalow";
  if (/\brow ?house\b/.test(s)) return "Row house";
  if (/\bclinic\b/.test(s)) return "Clinic";
  if (/\boffice|workspace|co-?working\b/.test(s)) return "Office";
  if (/\b(flat|apartment|bhk)\b/.test(s)) return "Apartment";
  return undefined;
}

export interface ExtractResult { changed: Record<string, unknown>; correction?: { slot: string; from: string; to: string } }

/**
 * Deterministic extractor. Reads one caller utterance with the slot the agent just asked as a hint.
 * Merges into state; records corrections ("actually it's 15 lakh") and contradictions.
 */
export function extractInto(state: CallState, utterance: string, hint: Slot | undefined, now: Date): ExtractResult {
  // "Maybe 10 lakh. Actually no, more like 18" → read what came before the correction first,
  // so the change is recorded as a correction instead of silently overwriting.
  const corrRe = new RegExp(CORRECTION.source, "gi");
  let lastIdx = -1; let mm: RegExpExecArray | null;
  while ((mm = corrRe.exec(utterance))) lastIdx = mm.index;
  if (lastIdx > 3 && utterance.length - lastIdx > 6) {
    const pre = utterance.slice(0, lastIdx);
    const first = extractInto(state, pre, hint, now);
    state.unclear = state.unclear.filter((u) => u !== hint);
    const second = extractInto(state, utterance.slice(lastIdx), hint, now);
    return { changed: { ...first.changed, ...second.changed }, correction: second.correction ?? first.correction };
  }
  const changed: Record<string, unknown> = {};
  const t = utterance;
  const isCorrection = CORRECTION.test(t);
  let correction: ExtractResult["correction"];
  const hedged = HEDGE.test(t);

  const name = parseName(t, hint);
  if (name && (!state.name || hint === "name")) { state.name = name; changed.name = name; }

  const bhk = parseBhk(t);
  if (bhk && bhk !== state.bhk) {
    if (state.bhk && isCorrection) correction = { slot: "bhk", from: `${state.bhk} BHK`, to: `${bhk} BHK` };
    state.bhk = bhk; changed.bhk = bhk;
  }
  const prop = propertyOf(t);
  if (prop && (!state.propertyType || state.propertyType === "Apartment")) { state.propertyType = prop; changed.propertyType = prop; }

  // "Do you do Airbnb furnishing?" is a question, not a request — answered from services.md, not added to the brief
  const isServiceQuestion = /\b(do you|can you|does aangan|will you)\b.*\b(do|handle|provide|offer|take|work on|make)\b/i.test(t) && /\?|^\s*(do|can|does|will)\b/i.test(t.trim());
  const svc = isServiceQuestion ? { provided: [], excluded: [], propertyLevel: false } : matchServices(t);
  for (const id of svc.provided) if (!state.servicesRequested.includes(id)) state.servicesRequested.push(id);
  for (const id of svc.excluded) if (!state.servicesExcluded.includes(id)) state.servicesExcluded.push(id);
  if (svc.propertyLevel) {
    // a restaurant kitchen is still a restaurant: property-level exclusions absorb provided matches from the same utterance
    state.servicesRequested = state.servicesRequested.filter((id) => !svc.provided.includes(id));
  }
  if (svc.provided.length || svc.excluded.length) changed.services = { provided: state.servicesRequested, excluded: state.servicesExcluded };

  for (const [re, label] of REQ_PATTERNS) if (re.test(t) && !state.requirements.includes(label)) state.requirements.push(label);

  // scope
  const scope = deriveScope(state, t);
  if (scope && scope !== state.projectScope) { state.projectScope = scope; changed.projectScope = scope; }
  if (state.projectScope) state.projectType = scopeLabel(state.projectScope);

  const area = parseArea(t, hint);
  if (area) {
    if (state.area && state.area !== area) correction = { slot: "area", from: `${state.area} sq ft`, to: `${area} sq ft` };
    state.area = area; changed.area = area;
    if (hedged) addOnce(state.hedged, "area");
  }

  const loc = parseLocation(t, hint);
  if (loc?.location) {
    if (state.location && state.location !== loc.location && isCorrection) correction = { slot: "location", from: state.location, to: loc.location };
    state.location = loc.location; state.inServiceArea = loc.inServiceArea ?? null; changed.location = loc.location;
  }

  const b = parseBudget(t, hint);
  if (b && !b.unsure && (b.min || b.max)) {
    if ((state.budgetMax || state.budgetMin) && (b.max !== state.budgetMax || b.min !== state.budgetMin)) {
      correction = { slot: "budget", from: state.budgetText ?? "", to: (b.text ?? "").trim() };
      const prevMax = state.budgetMax ?? state.budgetMin ?? 0;
      const newMax = b.max ?? b.min ?? 0;
      if (prevMax && Math.abs(newMax - prevMax) / prevMax > 0.4) addOnce(state.contradictions, `Budget changed during the call: "${state.budgetText}" → "${(b.text ?? "").trim()}"`);
    }
    state.budgetMin = b.min; state.budgetMax = b.max; state.budgetText = cleanQuote(b.text ?? t); changed.budget = state.budgetText;
    if (hedged) addOnce(state.hedged, "budget");
  } else if (b?.unsure && hint === "budget") { addOnce(state.unclear, "budget"); state.budgetText = cleanQuote(t); }

  const tl = parseTimeline(t, now, hint);
  if (tl && !tl.unsure && tl.months != null) {
    if (state.timelineMonths != null && state.timelineMonths !== tl.months && isCorrection) correction = { slot: "timeline", from: state.timelineText ?? "", to: tl.text ?? "" };
    state.timelineMonths = tl.months; state.timelineText = cleanQuote(tl.text ?? t); changed.timeline = state.timelineText;
    if (hedged) addOnce(state.hedged, "timeline");
  } else if (tl?.unsure && hint === "timeline") { addOnce(state.unclear, "timeline"); state.timelineText = cleanQuote(t); }

  // a slot that was asked but produced nothing usable is unclear
  if (hint && !Object.keys(changed).length) {
    const filled = slotFilled(state, hint);
    if (!filled) addOnce(state.unclear, hint);
  }
  for (const k of Object.keys(changed)) {
    const s = k === "projectScope" || k === "services" || k === "bhk" || k === "propertyType" ? "project" : k;
    state.unclear = state.unclear.filter((u) => u !== s);
  }

  // contradiction: BHK vs area
  if (state.bhk && state.area) {
    const range = getKB().qualified.data.contradictions.sqftPerBhk[String(state.bhk)];
    if (range && (state.area < range[0] * 0.8 || state.area > range[1] * 1.25)) {
      addOnce(state.contradictions, `${state.bhk} BHK at ${state.area} sq ft is outside the usual ${range[0]}–${range[1]} sq ft range`);
    }
  }
  if (correction) state.corrections.push(correction);
  return { changed, correction };
}

function cleanQuote(s: string) { return s.trim().replace(/\s+/g, " ").slice(0, 80); }
function addOnce<T>(arr: T[], v: T) { if (!arr.includes(v)) arr.push(v); }

export function deriveScope(state: CallState, t: string): string | undefined {
  const s = t.toLowerCase();
  const req = state.servicesRequested;
  if (state.servicesExcluded.length && !req.length) return undefined;
  if (req.includes("office") || /\b(office|clinic|workspace)\b/.test(s)) return "office";
  if (req.includes("design_only")) return "design_only";
  if (req.includes("renovation") && !req.includes("full_home")) return "renovation";
  if (req.includes("full_home") || state.bhk || /\b(full|whole|complete|entire)\b/.test(s) || /\binteriors?\b/.test(s) && (state.bhk || state.propertyType)) return "full_home";
  if (req.includes("kitchen_wardrobe")) return state.projectScope === "full_home" ? "full_home" : "kitchen_wardrobe";
  return state.projectScope;
}

export function scopeLabel(id: string) {
  const e = getKB().services.data.provided.find((p) => p.id === id);
  return ({ full_home: "Full home interiors", office: "Office interiors", kitchen_wardrobe: "Modular kitchen (standalone)", renovation: "Interior renovation", design_only: "Design-only consultation" } as Record<string, string>)[id] ?? e?.label ?? id;
}

export function slotFilled(s: CallState, slot: Slot): boolean {
  switch (slot) {
    case "name": return !!s.name;
    case "project": return !!s.projectScope || s.servicesExcluded.length > 0;
    case "location": return !!s.location;
    case "area": return !!s.area || s.projectScope === "kitchen_wardrobe";
    case "services": return s.servicesRequested.length > 0 || s.servicesExcluded.length > 0;
    case "timeline": return s.timelineMonths != null;
    case "budget": return s.budgetMax != null || s.budgetMin != null;
  }
}
