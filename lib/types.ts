// The "shape" of our data. Think of these as blank forms that every lead must fit.

export type Priority = "Hot" | "Warm" | "Cold";

// What the salesperson types into the intake form
export interface LeadInput {
  name: string;
  location: string;
  requirement: string;
  budget: string;
  timeline: string;
  message: string;
}

// What the AI sends back about a lead
export interface Analysis {
  summary: string;
  intent: string;
  keyRequirements: string[];
  objections: string[];
  nextAction: string;
  suggestedResponse: string;
  score: number; // 0-100, produced by the AI using our scoring rubric
  scoreReason: string; // one line: why this score
  priority: Priority; // derived from the score by OUR code, not the AI
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Our own feature: a record of each call the salesperson logs
export interface CallLog {
  id: string;
  date: string;
  notes: string;
  outcome: string;
  previousScore: number;
  newScore: number;
}

// A saved lead = the form input + the AI analysis + chat + call history
export interface Lead extends LeadInput {
  id: string;
  createdAt: string;
  analysis: Analysis;
  chat: ChatMessage[];
  calls: CallLog[];
}
