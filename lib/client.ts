// Small helpers used by the browser side of the app.
import type { LeadInput, Priority } from "./types";
import { clearSession, readSession } from "./auth";

// Where our FastAPI backend lives. Set NEXT_PUBLIC_API_URL in .env.local (locally) or in Vercel.
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

// Pings the server without waiting for the answer. The login page calls this on open, so a sleeping
// free-tier server starts waking up while the person is still typing their password.
export function warmUp() {
  fetch(`${API_URL}/healthz`, { cache: "no-store" }).catch(() => {});
}

// An error that remembers the HTTP status code (e.g. 404 = not found, 401 = not logged in)
export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

// Calls one of our backend endpoints with the login token attached, and returns the answer
// (or throws a readable error)
export async function api<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body) headers["Content-Type"] = "application/json";
  const session = readSession();
  if (session) headers["Authorization"] = `Bearer ${session.token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Can't reach the server. If it was idle, it may be waking up: try again in 30 seconds.", 0);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // token missing or expired on a protected page: log out, which sends the user to the login page
    if (res.status === 401 && !path.startsWith("/auth/")) clearSession();
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status);
  }
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

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export const TIMELINES = ["Within 1 month", "1-3 months", "3-6 months", "6+ months", "Just exploring"];

export type LeadErrors = Partial<Record<keyof LeadInput, string>>;

// Returns one message per invalid field (empty object = valid), so each box can show its own problem
export function validateLead(lead: LeadInput): LeadErrors {
  const errors: LeadErrors = {};
  const required: [keyof LeadInput, string][] = [
    ["name", "Name"],
    ["location", "Location"],
    ["requirement", "Property requirement"],
    ["budget", "Budget"],
  ];
  for (const [field, label] of required) {
    if (lead[field].trim().length < 2) errors[field] = `${label} is required.`;
  }
  for (const [field, rule] of Object.entries(RULES)) {
    const key = field as keyof LeadInput;
    if (!errors[key] && !rule.re.test(lead[key])) errors[key] = rule.label;
  }
  if (!TIMELINES.includes(lead.timeline)) errors.timeline = "Please pick a buying timeline.";

  const message = lead.message.trim();
  if (!message) errors.message = "Customer message is required.";
  else if (message.length < 5) errors.message = "Customer message is too short.";
  else if (message.length > 2000) errors.message = "Customer message must be under 2000 characters.";

  const phone = lead.phone.trim();
  if (phone) {
    const digits = phone.replace(/\D/g, "");
    if (!/^[\d+\s()-]+$/.test(phone)) errors.phone = "Only digits, spaces and + - ( ) are allowed.";
    else if (digits.length < 10 || digits.length > 15) errors.phone = "Phone number must have 10 to 15 digits.";
    else if (!phone.startsWith("+") && digits.length === 10 && !/^[6-9]/.test(digits))
      errors.phone = "An Indian mobile number starts with 6, 7, 8 or 9.";
  }
  if (lead.email.trim() && !EMAIL_RE.test(lead.email.trim())) errors.email = "Please enter a valid email address.";
  return errors;
}

// WhatsApp needs the full international number. A plain 10-digit number is assumed to be Indian (+91).
export function whatsappNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  return phone.startsWith("+") || digits.length > 10 ? digits : `91${digits}`;
}

// Colors for each priority, so a salesperson can scan the list by color
export const PRIORITY_STYLES: Record<Priority, { badge: string; dot: string; label: string }> = {
  Hot: { badge: "bg-red-100 text-red-700 border-red-200", dot: "bg-red-500", label: "🔥 HOT" },
  Warm: { badge: "bg-amber-100 text-amber-800 border-amber-200", dot: "bg-amber-500", label: "🌤 WARM" },
  Cold: { badge: "bg-sky-100 text-sky-700 border-sky-200", dot: "bg-sky-500", label: "❄️ COLD" },
};

// Realistic example leads so the app can be demoed in seconds
export const SAMPLE_LEADS: LeadInput[] = [
  {
    name: "Rahul Sharma",
    phone: "9822012345",
    email: "",
    location: "Hinjewadi, Pune",
    requirement: "2BHK apartment",
    budget: "₹80 lakh",
    timeline: "1-3 months",
    message:
      "Hi, I'm looking for a 2BHK apartment near Hinjewadi. My budget is around 80 lakhs. I am planning to buy within the next 2 months. Please suggest some good options.",
  },
  {
    name: "Rohit Agarwal",
    phone: "9876543210",
    email: "rohit.agarwal@example.com",
    location: "Whitefield, Bangalore",
    requirement: "3BHK apartment, ready to move, near IT park",
    budget: "₹1.2 - 1.4 Cr",
    timeline: "Within 1 month",
    message:
      "Hi, my home loan is already approved by HDFC. We are relocating from Pune and need to move in before my kids' school starts next month. Can we do a site visit this Saturday? Also want to know if there is covered parking for 2 cars.",
  },
  {
    name: "Sneha Iyer",
    phone: "+91 98200 12345",
    email: "sneha.iyer@example.com",
    location: "Thane West, Mumbai",
    requirement: "2BHK, under-construction is okay",
    budget: "Around ₹85 L",
    timeline: "3-6 months",
    message:
      "Looking for a 2BHK for my parents. Saw your ad. The price seems a bit high compared to other projects nearby. What are the payment plans? My father is also worried about possession delays.",
  },
  {
    name: "Arjun Mehta",
    phone: "",
    email: "",
    location: "Anywhere in Pune",
    requirement: "Maybe a plot or villa",
    budget: "Not shared",
    timeline: "Just exploring",
    message: "Send details.",
  },
];
