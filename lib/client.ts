// Small helpers used by the browser side of the app.
import type { LeadInput, Priority } from "./types";

// Where our FastAPI backend lives. Set NEXT_PUBLIC_API_URL in .env.local (locally) or in Vercel.
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

// Calls one of our backend endpoints and returns the answer (or throws a readable error)
export async function api<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Can't reach the server. If it was idle, it may be waking up: try again in 30 seconds.");
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

// ---- Input rules (the same rules the backend enforces; the backend is the real gate) ----
const LETTER = "\\p{L}\\p{M}";
const RULES: Record<string, { re: RegExp; label: string }> = {
  name: { re: new RegExp(`^[${LETTER} .'-]*$`, "u"), label: "Name can only contain letters, spaces, . ' -" },
  location: { re: new RegExp(`^[${LETTER}\\p{N} ,./()-]*$`, "u"), label: "Location can only contain letters, numbers, spaces, , . / ( ) -" },
  requirement: { re: new RegExp(`^[${LETTER}\\p{N} ,./+()&-]*$`, "u"), label: "Requirement can only contain letters, numbers, spaces, , . / + ( ) & -" },
  budget: { re: new RegExp(`^[${LETTER}\\p{N} ₹.,+/-]*$`, "u"), label: "Budget can only contain numbers, letters, spaces, ₹ . , + / -" },
};

export function validateLead(lead: LeadInput): string | null {
  if (lead.name.trim().length < 2) return "Name must have at least 2 letters.";
  if (!lead.message.trim()) return "Customer message is required.";
  if (lead.message.length > 2000) return "Customer message must be under 2000 characters.";
  for (const [field, rule] of Object.entries(RULES)) {
    if (!rule.re.test(lead[field as keyof LeadInput])) return rule.label;
  }
  return null;
}

// Colors for each priority, so a salesperson can scan the list by color
export const PRIORITY_STYLES: Record<Priority, { badge: string; dot: string; label: string }> = {
  Hot: { badge: "bg-red-100 text-red-700 border-red-200", dot: "bg-red-500", label: "🔥 Hot" },
  Warm: { badge: "bg-amber-100 text-amber-800 border-amber-200", dot: "bg-amber-500", label: "🌤 Warm" },
  Cold: { badge: "bg-sky-100 text-sky-700 border-sky-200", dot: "bg-sky-500", label: "❄️ Cold" },
};

// Realistic example leads so the app can be demoed in seconds
export const SAMPLE_LEADS: LeadInput[] = [
  {
    name: "Rohit Agarwal",
    location: "Whitefield, Bangalore",
    requirement: "3BHK apartment, ready to move, near IT park",
    budget: "₹1.2 - 1.4 Cr",
    timeline: "Within 1 month",
    message:
      "Hi, my home loan is already approved by HDFC. We are relocating from Pune and need to move in before my kids' school starts next month. Can we do a site visit this Saturday? Also want to know if there is covered parking for 2 cars.",
  },
  {
    name: "Sneha Iyer",
    location: "Thane West, Mumbai",
    requirement: "2BHK, under-construction is okay",
    budget: "Around ₹85 L",
    timeline: "3-6 months",
    message:
      "Looking for a 2BHK for my parents. Saw your ad. The price seems a bit high compared to other projects nearby. What are the payment plans? My father is also worried about possession delays.",
  },
  {
    name: "Arjun Mehta",
    location: "Anywhere in Pune",
    requirement: "Maybe a plot or villa",
    budget: "",
    timeline: "Just exploring",
    message: "Send details.",
  },
];
