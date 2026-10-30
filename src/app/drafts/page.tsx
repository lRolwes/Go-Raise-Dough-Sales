import Link from "next/link";
import Form from "next/form";
import Shell from "@/components/Shell";
import Select from "@/components/Select";
import DraftCards, { type Draft } from "@/components/DraftCards";
import { createClient } from "@/lib/supabase/server";
import { currentMember, teamNames } from "@/lib/session";
import { DRAFT_STATUSES, REVIEW_STATUSES, centralDay, fmtDay, fmtWhen } from "@/lib/constants";

const LIMIT = 200;
type SP = Record<string, string | undefined>;
type Org = { name: string; town: string | null; state: string | null; category: string | null };
type Row = Omit<Draft, "org" | "when" | "reviewed_when" | "sent_when"> & {
  scheduled_for: string | null; reviewed_at: string | null; sent_at: string | null; updated_at: string; orgs: Org;
};

const COLS =
  "id,org_id,assignee,kind,seq,group_label,to_email,to_name,subject,body,original_subject,original_body,research_note,note," +
  "status,scheduled_for,reviewed_by,reviewed_at,sent_at,thread_url,updated_at,orgs!inner(name,town,state,category)";
const SORTS = [
  { value: "scheduled", label: "Send time" },
  { value: "org", label: "Organization" },
  { value: "status", label: "Status" },
  { value: "edited", label: "Last edited" },
];
const STATUS_VIEWS = [
  { value: "open", label: "Not sent yet" },
  ...DRAFT_STATUSES.map((s) => ({ value: s, label: s })),
  { value: "all", label: "All" },
];

/** When a Central-time day starts, as an ISO timestamp (Central is 5 or 6 hours behind UTC). */
function centralMidnight(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const cdt = new Date(Date.UTC(y, m - 1, d, 5));
  return (centralDay(cdt) === ymd ? cdt : new Date(Date.UTC(y, m - 1, d, 6))).toISOString();
}

function nextDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

// The list is sorted again after a search merges its two queries; unscheduled drafts go last.
const RANK = new Map<string, number>(DRAFT_STATUSES.map((s, i) => [s, i]));
const bySchedule = (a: Row, b: Row) =>
  (a.scheduled_for ?? "~").localeCompare(b.scheduled_for ?? "~") || (a.seq ?? 1e9) - (b.seq ?? 1e9);
const SORTERS: Record<string, (a: Row, b: Row) => number> = {
  scheduled: bySchedule,
  org: (a, b) => a.orgs.name.localeCompare(b.orgs.name) || bySchedule(a, b),
  status: (a, b) => (RANK.get(a.status) ?? 9) - (RANK.get(b.status) ?? 9) || bySchedule(a, b),
  edited: (a, b) => b.updated_at.localeCompare(a.updated_at),
};

export default async function DraftsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [team, me] = await Promise.all([teamNames(), currentMember()]);
  // Default to the signed-in sender's own queue; "everyone" shows the whole team's.
  const who = sp.who || me || "everyone";
  const status = STATUS_VIEWS.some((v) => v.value === sp.status) ? sp.status! : "open";
  const day = sp.day === "none" || /^\d{4}-\d{2}-\d{2}$/.test(sp.day ?? "") ? sp.day : undefined;
  const group = sp.group || undefined;
  const state = sp.state || undefined;
  const term = (sp.q ?? "").replace(/[%,()"\\*]/g, " ").trim();
  const sort = SORTS.some((s) => s.value === sp.sort) ? sp.sort! : "scheduled";

  /** Drafts with every filter applied, `st` being a status, "open" or "all". A search runs as two queries, one on the
   *  email's own text and one on the org's name and town, because PostgREST can't OR across tables; merge them by id. */
  const find = (select: string, st: string, how: "count" | "rows" | "list") => {
    const one = () => {
      let q = supabase.from("drafts").select(select, how === "count" ? { count: "exact", head: true } : undefined);
      if (who !== "everyone") q = q.eq("assignee", who);
      if (st === "open") q = q.not("status", "in", "(Sent,Bounced)");
      else if (st !== "all") q = q.eq("status", st);
      if (day === "none") q = q.is("scheduled_for", null);
      else if (day) q = q.gte("scheduled_for", centralMidnight(day)).lt("scheduled_for", centralMidnight(nextDay(day)));
      if (group) q = q.eq("group_label", group);
      if (state) q = q.eq("orgs.state", state);
      if (how === "list") {
        if (sort === "org") q = q.order("orgs(name)");
        else if (sort === "edited") q = q.order("updated_at", { ascending: false });
        q = q.order("scheduled_for", { nullsFirst: false }).order("seq", { nullsFirst: false }).limit(LIMIT);
      }
      return q;
    };
    if (!term) return [one()];
    return [
      one().or(`subject.ilike.%${term}%,body.ilike.%${term}%`),
      one().or(`name.ilike.%${term}%,town.ilike.%${term}%`, { referencedTable: "orgs" }),
    ];
  };

  // the day, group and state choices: whatever this person's drafts in this status have
  let optsQ = supabase.from("drafts").select("scheduled_for,group_label,orgs(state)").order("scheduled_for", { ascending: false }).limit(1000);
  if (who !== "everyone") optsQ = optsQ.eq("assignee", who);
  if (status === "open") optsQ = optsQ.not("status", "in", "(Sent,Bounced)");
  else if (status !== "all") optsQ = optsQ.eq("status", status);

  const [lists, tallies, opts] = await Promise.all([
    Promise.all(find(COLS, status, "list")),
    // counts per status for the summary bar: exact head counts, or (for a search) the merged id lists
    term
      ? Promise.all(find("id,status,orgs!inner(state)", "all", "rows"))
      : Promise.all(DRAFT_STATUSES.map((s) => find("id,orgs!inner(state)", s, "count")[0])),
    optsQ,
  ]);
  const error = [...lists, ...tallies, opts].find((r) => r.error)?.error?.message;

  const rows = [...new Map(lists.flatMap((r) => (r.data ?? []) as unknown as Row[]).map((r) => [r.id, r])).values()].sort(SORTERS[sort]);
  const counts: Record<string, number> = Object.fromEntries(DRAFT_STATUSES.map((s) => [s, 0]));
  if (term)
    for (const r of new Map(tallies.flatMap((t) => (t.data ?? []) as unknown as { id: string; status: string }[]).map((r) => [r.id, r])).values())
      counts[r.status] = (counts[r.status] ?? 0) + 1;
  else DRAFT_STATUSES.forEach((s, i) => (counts[s] = tallies[i].count ?? 0));
  const open = REVIEW_STATUSES.reduce((n, s) => n + counts[s], 0);
  const all = DRAFT_STATUSES.reduce((n, s) => n + counts[s], 0);
  const total = status === "open" ? open : status === "all" ? all : counts[status];

  const optRows = (opts.data ?? []) as unknown as { scheduled_for: string | null; group_label: string | null; orgs: { state: string | null } | null }[];
  const uniq = (xs: (string | null | undefined)[], keep?: string) =>
    [...new Set([...xs, keep].filter((x): x is string => !!x))].sort();
  const days = uniq(optRows.map((r) => (r.scheduled_for ? centralDay(r.scheduled_for) : null)), day === "none" ? undefined : day);
  const dayOpts = days.map((d) => ({ value: d, label: fmtDay(d) }));
  if (day === "none" || optRows.some((r) => !r.scheduled_for)) dayOpts.push({ value: "none", label: "Not scheduled" });
  const groups = uniq(optRows.map((r) => r.group_label), group);
  const states = uniq(optRows.map((r) => r.orgs?.state), state);
  const whoOpts = [
    ...team.map((t) => ({ value: t, label: t === me ? `${t} (me)` : t })),
    ...(who !== "everyone" && !team.includes(who) ? [{ value: who, label: who }] : []),
    { value: "everyone", label: "Everyone" },
  ];

  const drafts: Draft[] = rows.map(({ orgs, scheduled_for, reviewed_at, sent_at, updated_at: _, ...r }) => ({
    ...r,
    org: orgs,
    when: fmtWhen(scheduled_for) || null,
    reviewed_when: fmtWhen(reviewed_at) || null,
    sent_when: fmtWhen(sent_at) || null,
  }));

  const qs = (patch: SP) => {
    const p = new URLSearchParams();
    Object.entries({ ...sp, ...patch }).forEach(([k, v]) => v && p.set(k, v));
    return `/drafts?${p.toString()}`;
  };
  // a new filter remounts the form and the cards; a refresh after a save keeps them
  const viewKey = JSON.stringify(sp);
  const chips = [
    { value: "open", label: "Not sent yet", n: open },
    ...DRAFT_STATUSES.map((s) => ({ value: s, label: s, n: counts[s] })),
    { value: "all", label: "All", n: all },
  ];

  return (
    <Shell active="drafts">
      <div className="head">
        <h1>Drafts</h1>
        <span className="count">{total.toLocaleString()} {total === 1 ? "email" : "emails"}</span>
      </div>
      <p className="small muted" style={{ margin: "-8px 0 0" }}>
        Read each email, fix anything you like (it saves as you type), then mark it OK to send, Needs changes or Skip.
        Only the ones marked OK to send go out, as you left them.
      </p>

      <Form key={viewKey} action="/drafts" className="card filters">
        <Select label="Whose drafts" name="who" value={who} options={whoOpts} any={null} />
        <Select label="Status" name="status" value={status} options={STATUS_VIEWS} any={null} />
        <Select label="Send day" name="day" value={day} options={dayOpts} any="Any day" />
        <Select label="Group" name="group" value={group} options={groups} />
        <Select label="State" name="state" value={state} options={states} />
        <label className="wide">
          Search org, town, subject or email
          <input id="f-q" name="q" defaultValue={sp.q ?? ""} placeholder="e.g. Legion, Belleville, Queen" />
        </label>
        <Select label="Sort" name="sort" value={sort} options={SORTS} any={null} />
        <button className="btn" type="submit">Show</button>
        <Link href="/drafts" className="small">Clear</Link>
      </Form>

      <nav className="chips" aria-label="Count by status">
        {chips.map((c) => (
          <Link key={c.value} href={qs({ status: c.value })} className={status === c.value ? "on" : ""}>
            {c.label} <b>{c.n.toLocaleString()}</b>
          </Link>
        ))}
      </nav>

      {error && <div className="error">{error}</div>}
      {total > drafts.length && (
        <div className="notice">Showing the first {drafts.length} of {total.toLocaleString()}. Narrow the filters to see the rest.</div>
      )}

      {drafts.length ? (
        <DraftCards key={viewKey} drafts={drafts} />
      ) : (
        <div className="card muted">No drafts match. Try “Everyone” or “All”.</div>
      )}
    </Shell>
  );
}
