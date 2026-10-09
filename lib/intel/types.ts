/** Call Intelligence layer — post-call analysis on top of qualification (adapted from the Call Analysis Pipeline reference). */
export type CallClass = "ENQUIRY" | "EXISTING_CLIENT" | "VENDOR_OR_OTHER";

export interface ConversationSignals {
  turns: number;
  callerTalkRatio: number; // 0..1, by words
  agentTalkRatio: number;
  callerQuestions: number;
  agentQuestions: number;
  avgCallerWords: number;
  priceMentions: number;
  hesitations: number; // "not sure", "maybe", "let me think"
}

export interface ObjectionDetail {
  type: "price" | "trust" | "delay" | "confusion" | "competition" | "scope";
  strength: "weak" | "moderate" | "strong" | "critical";
  resolved: boolean;
  customerQuote: string;
  agentResponse: string;
  idealResponse: string;
}

export interface Swot { strengths: string[]; weaknesses: string[]; opportunities: string[]; threats: string[] }
export interface ImprovementArea { skill: string; observed: string; fix: string }

export interface PhoenixProtocol {
  verdict: "DEAD_LEAD" | "NURTURE" | "HIGH_PRIORITY_RECOVERY";
  stallRootCause: string;
  recoveryProbability: number; // 1..10
  hearYouHook: string;
  commercialInsight: string;
  mustSayScript: string;
  waitDays: number;
  decisionMakerBridge: string;
}

export interface CallAnalysis {
  callClass: CallClass;
  classReason: string;
  objections: ObjectionDetail[];
  swot: Swot;
  dealOutcome: "likely_closed" | "follow_up_needed" | "likely_lost" | "uncertain";
  dealProbability: number; // 0..1
  buyerSignals: "high" | "medium" | "low";
  lostOpportunityReason: string;
  agentImprovementAreas: ImprovementArea[];
  coachingRecommendations: string[];
  callSummary: string;
  phoenix: PhoenixProtocol | null;
  signals: ConversationSignals;
  opportunityScore: number; // 0..100 (OpportunityEngine)
  engine: string;
  analysedAt: string;
  attempts: number;
}
