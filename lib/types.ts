// The "shape" of our data. Think of these as blank forms that every lead must fit.

export type Priority = "Hot" | "Warm" | "Cold";

// What the salesperson types into the intake form
export interface LeadInput {
  name: string;
  phone: string; // optional; never sent to the AI
  email: string; // optional; never sent to the AI
  location: string;
  requirement: string;
  budget: string;
  timeline: string;
  message: string; // the customer's own words
}

// One signal of the transparent score, e.g. "Budget clarity 18/20"
export interface ScoreSignal {
  key: string;
  label: string;
  points: number;
  max: number;
  note: string;
}

// Our own feature: HOW to act on the lead (the analysis says WHAT the lead looks like)
export interface ActionPlan {
  immediateAction: string;
  questionsToAsk: string[];
  talkingPoints: string[];
  followUp: string;
}

// What the AI sends back about a lead
export interface Analysis {
  summary: string;
  intent: string;
  keyRequirements: string[];
  objections: string[];
  nextAction: string;
  suggestedResponse: string;
  score: number; // 0-100 = sum of the AI's signal points minus the objection penalty (added up by OUR code)
  scoreReason: string; // why this priority, in plain words
  priority: Priority; // derived from the score by OUR code, so labels are always consistent
  // optional: leads saved before these existed don't have them (they can be re-analyzed)
  scoreBreakdown?: ScoreSignal[];
  objectionPenalty?: number;
  actionPlan?: ActionPlan;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// A record of each call the salesperson logs ("After the call" re-scoring)
export interface CallLog {
  id: string;
  date: string;
  notes: string;
  outcome: string;
  previousScore: number;
  newScore: number;
}

export interface Person {
  id: string;
  name: string;
}

// A saved lead = the form input + the AI analysis + chat + call history.
// Leads belong to a team; claimedBy is the one salesperson working it (null = open for anyone).
export interface Lead extends LeadInput {
  id: string;
  addedBy: Person;
  claimedBy: Person | null;
  claimedAt: string | null;
  createdAt: string;
  analysis: Analysis;
  chat: ChatMessage[];
  calls: CallLog[];
}

// Dashboard numbers, calculated by the backend with SQL
export interface Stats {
  total: number;
  avgScore: number;
  byClaim: { open: number; mine: number };
  byPriority: Record<Priority, number>;
  byTimeline: { label: string; count: number }[];
  scoreBuckets: { label: string; count: number }[];
  perDay: { date: string; count: number }[];
  calls: { count: number; avgScoreChange: number };
}

export type SortKey = "score" | "newest" | "urgent";
export type ClaimView = "all" | "open" | "mine";

// A live update pushed by the server when a teammate changes a lead ("resync" = we reconnected)
export type LeadEvent =
  | { type: "created" | "claimed" | "released" | "updated"; actor: Person; lead: Lead }
  | { type: "deleted"; actor: Person; leadId: string }
  | { type: "resync" };
