import type { CallAnalysis, CallClass } from "./intel/types";

export type LeadStatus =
  | "NEW"
  | "IN_PROGRESS"
  | "QUALIFIED"
  | "NOT_QUALIFIED"
  | "NEEDS_HUMAN_REVIEW"
  | "DESIGNER_CONTACTED"
  | "CONSULTATION"
  | "PROJECT_WON"
  | "PROJECT_LOST";

export type Decision = "QUALIFIED" | "NOT_QUALIFIED" | "NEEDS_HUMAN_REVIEW";
export type HandoffStatus = "NOT_SENT" | "SENT" | "ACKNOWLEDGED";
export type ConsultationStatus = "NOT_SCHEDULED" | "SCHEDULED" | "COMPLETED" | "NO_SHOW";
export type ProjectOutcome = "PENDING" | "WON" | "LOST";
export type Cohort = "AUTOMATION" | "BASELINE";
export type Slot = "name" | "project" | "location" | "area" | "services" | "timeline" | "budget";

export interface Lead {
  id: string;
  customerName?: string | null;
  phoneNumber: string;
  enquiryDate: string;
  enquiryTime: string;
  enquiryAt: string;
  source: "PHONE";
  projectType?: string | null;
  propertyType?: string | null;
  projectScope?: string | null;
  bhk?: number | null;
  location?: string | null;
  inServiceArea?: boolean | null;
  approximateArea?: number | null;
  budget?: string | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  timeline?: string | null;
  timelineMonths?: number | null;
  requirements: string[];
  servicesRequested: string[];
  servicesExcluded: string[];

  status: LeadStatus;
  aiDecision?: Decision | null;
  decision?: Decision | null;
  qualificationReason?: string | null;
  confidenceScore?: number | null;
  ruleTrace: RuleResult[];
  missingFields: string[];
  reviewReasons: string[];
  recommendedAction?: string | null;
  highValue: boolean;

  indicativePricingShown: boolean;
  indicativePricingText?: string | null;
  conversationSummary?: string | null;

  designerHandoffStatus: HandoffStatus;
  handoffChannel?: string | null;
  handoffSentAt?: string | null;
  handoffAckAt?: string | null;
  handoffMessage?: string | null;
  designerAssigned?: string | null;
  designerContactedAt?: string | null;

  consultationStatus: ConsultationStatus;
  consultationAt?: string | null;
  consultationSource?: "calendly" | "manual" | null;
  bookingUrl?: string | null;
  calendly?: { inviteeUri: string | null; eventUri: string | null; rescheduleUrl: string | null; cancelUrl: string | null; bookedAt: string; joinUrl: string | null; matchedBy: string | null } | null;
  projectOutcome: ProjectOutcome;
  projectValue?: number | null;
  outcomeRecordedBy?: string | null;
  outcomeAt?: string | null;

  intel?: CallAnalysis | null;
  callClass?: CallClass;
  responseTimeSeconds?: number | null;
  aiCost: number;
  afterHours: boolean;
  cohort: Cohort;
  engine: string;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RuleResult {
  id: string;
  name: string;
  result: "PASS" | "FAIL" | "UNKNOWN" | "REVIEW" | "SKIP";
  detail: string;
  source: string;
}

export interface Turn {
  speaker: "agent" | "caller" | "system";
  text: string;
  at: number; // seconds from call start
  meta?: {
    slot?: Slot;
    kb?: string[];
    extracted?: Record<string, unknown>;
    pricing?: boolean;
    event?: string;
  };
}

export interface CostBreakdown {
  telephony: number;
  transcription: number;
  tts: number;
  llm: number;
  messaging: number;
  other: number;
  total: number;
  minutes: number;
  tokensIn: number;
  tokensOut: number;
}

export interface Call {
  id: string;
  leadId: string | null;
  phone: string;
  startedAt: string;
  durationSec: number;
  status: "ANSWERED" | "FAILED" | "ABANDONED";
  failureReason?: string | null;
  afterHours: boolean;
  transcript: Turn[];
  cost: CostBreakdown;
  engine: string;
}

export interface AuditEvent {
  id?: number;
  leadId: string | null;
  callId?: string | null;
  at: string;
  type: string;
  actor: string;
  message: string;
  severity?: "info" | "warn" | "error";
  data?: Record<string, unknown>;
}

export interface Override {
  leadId: string;
  originalAIStatus: string;
  humanStatus: string;
  reason: string;
  user: string;
  timestamp: string;
}

export interface Baseline {
  label: string;
  source: "DEMO_ASSUMPTION" | "ENTERED";
  period: string;
  enquiries: number;
  responded5min: number;
  qualified: number;
  handoffs: number;
  consultations: number;
  won: number;
  revenue: number;
  design: "PRE_POST" | "RANDOMISED" | "NONE";
  notes: string;
  updatedAt: string;
}
