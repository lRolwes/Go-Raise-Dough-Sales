export const STATUSES = [
  "Not contacted",
  "Draft ready",
  "Sent",
  "Replied",
  "Meeting set",
  "Not interested",
  "Customer",
  "Bounced",
] as const;

export const CATEGORIES = [
  "Veterans",
  "Fraternal",
  "Catholic parish",
  "Catholic school",
  "School & boosters",
  "Nonprofit",
  "Community & festival",
  "Inbound lead",
  "Other",
] as const;

export const FUNDRAISING = [
  "Queen of Hearts",
  "50/50",
  "Mega raffle",
  "Other raffles",
  "Bingo & gaming",
  "Events only",
  "Unknown",
] as const;

export const GAME_STATUSES = ["Running now", "Check status", "Past game", "Good fit", "Start a game"] as const;

export const CONTACT_TYPES = ["Named contact", "Generic inbox", "Phone only", "Inbound", "No contact info"] as const;

export const FITS = ["high", "medium", "low"] as const;

export const ACTIVITY_KINDS = [
  "Call",
  "Voicemail",
  "Email sent",
  "Email received",
  "Meeting",
  "Note",
  "Bounce",
  "Status change",
] as const;

export const STATES = ["IL", "MO", "OK", "NY"] as const;

/** Today's date in Central time, as YYYY-MM-DD. */
export function todayCentral(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

export function fmtDate(d?: string | null): string {
  if (!d) return "";
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function statusClass(s?: string | null): string {
  return "st st-" + (s || "").toLowerCase().replace(/[^a-z]+/g, "-");
}
