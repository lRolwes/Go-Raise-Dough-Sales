export const STATUSES = [
  "Not contacted",
  "Draft ready",
  "Sent",
  "Replied",
  "Qualification & Discovery",
  "Meeting set",
  "Demo / Presentation",
  "Proposal / Quote",
  "Negotiation",
  "Customer",
  "Not interested",
  "Bounced",
] as const;

/** The sales stages from Mike's example: a conversation is under way and the deal is still open.
 *  Customer is "Closed Won" and Not interested is "Closed Lost". */
export const DEAL_STAGES = ["Qualification & Discovery", "Meeting set", "Demo / Presentation", "Proposal / Quote", "Negotiation"];

export const CATEGORIES = [
  "Veterans",
  "Fraternal",
  "Catholic parish",
  "Catholic school",
  "Catholic ministry",
  "Christian school",
  "Christian church",
  "School & boosters",
  "Private school",
  "Alumni association",
  "Youth sports",
  "Pro-life",
  "Health & disability",
  "First responders",
  "Sportsmen & conservation",
  "Agriculture & rural",
  "Animals & outdoors",
  "Arts & culture",
  "Heritage & preservation",
  "Parks & community",
  "Human services",
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

export const STATES = ["IL", "MO", "OK", "IN", "NC", "MS", "WY", "NY"] as const;

/** Email drafts (the `drafts` table). Sent and Bounced are set by Claude when it sends; the rest by the reviewer. */
export const DRAFT_STATUSES = ["To review", "OK to send", "Needs changes", "Skip", "Sent", "Bounced"] as const;
export const REVIEW_STATUSES = ["To review", "OK to send", "Needs changes", "Skip"] as const;

/** Today's date in Central time, as YYYY-MM-DD. */
export function todayCentral(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

/** The Central-time calendar date of a timestamp, as YYYY-MM-DD. */
export function centralDay(ts: string | Date): string {
  return new Date(ts).toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

/** A YYYY-MM-DD date as "Wed Nov 4" (with the year when it isn't this year). */
export function fmtDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const opts: Intl.DateTimeFormatOptions = { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" };
  if (String(y) !== todayCentral().slice(0, 4)) opts.year = "numeric";
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", opts).replace(/,/g, "");
}

/** A timestamp in Central time, e.g. "Wed Nov 4, 9:15 AM". */
export function fmtWhen(ts?: string | null): string {
  if (!ts) return "";
  const time = new Date(ts).toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" });
  return `${fmtDay(centralDay(ts))}, ${time}`;
}

export function fmtDate(d?: string | null): string {
  if (!d) return "";
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function statusClass(s?: string | null): string {
  return "st st-" + (s || "").toLowerCase().replace(/[^a-z]+/g, "-");
}
