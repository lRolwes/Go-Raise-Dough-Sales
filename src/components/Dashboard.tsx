import Link from "next/link";
import { STATES, fmtDate, statusClass } from "@/lib/constants";

type Cell = {
  status: string; assignee: string | null; category: string | null; state: string | null;
  fundraising: string | null; contact_type: string | null; n: number;
};
type FollowCell = { assignee: string | null; overdue: number; today: number; week: number; open: number };
type ActCell = { day: string; kind: string; n: number };
/** What the dashboard_stats() database function returns. */
export type Stats = { orgs: Cell[]; follow_ups: FollowCell[]; activity: ActCell[] };

export type DashboardData = {
  who: string | null;   // null = everyone, "unassigned", or a team member name
  me: string | null;
  team: string[];
  today: string;        // YYYY-MM-DD, Central time
  stats: Stats;
  due: { id: string; org_id: string; org_name: string; due_on: string; task: string; assignee: string | null }[];
  warm: { id: string; name: string; status: string; town: string | null; state: string | null; assignee: string | null; last_contact: string | null }[];
  warmNext: { org_id: string; due_on: string; task: string }[];
  conv: { id: string; org_id: string; org_name: string; occurred_on: string; kind: string; summary: string; by_member: string | null }[];
  error: string | null;
};

type Tally = { total: number; contacted: number; responded: number; bounced: number; byStatus: Record<string, number> };

/** Pipeline order for the status tiles and the per-person table. */
const PIPELINE = ["Not contacted", "Draft ready", "Sent", "Replied", "Meeting set", "Customer", "Not interested", "Bounced"];
const CONTACTED = new Set(["Sent", "Replied", "Meeting set", "Not interested", "Customer", "Bounced"]);
const RESPONDED = new Set(["Replied", "Meeting set", "Not interested", "Customer"]);

function tally(cells: Cell[]): Tally {
  const t: Tally = { total: 0, contacted: 0, responded: 0, bounced: 0, byStatus: {} };
  for (const c of cells) {
    t.total += c.n;
    t.byStatus[c.status] = (t.byStatus[c.status] ?? 0) + c.n;
    if (CONTACTED.has(c.status)) t.contacted += c.n;
    if (RESPONDED.has(c.status)) t.responded += c.n;
    if (c.status === "Bounced") t.bounced += c.n;
  }
  return t;
}

function groupBy(cells: Cell[], key: (c: Cell) => string): { key: string; t: Tally }[] {
  const by = new Map<string, Cell[]>();
  for (const c of cells) by.set(key(c), [...(by.get(key(c)) ?? []), c]);
  return [...by].map(([k, cs]) => ({ key: k, t: tally(cs) })).sort((a, b) => b.t.total - a.t.total);
}

/** Share of reached prospects (contacted, not bounced) that answered, yes or no. */
function replyRate(t: Tally): string {
  const reached = t.contacted - t.bounced;
  return reached ? `${Math.round((100 * t.responded) / reached)}%` : "–";
}

const pct = (n: number, of: number) => (!of || !n ? "0%" : n / of < 0.005 ? "<1%" : `${Math.round((100 * n) / of)}%`);

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function shortDate(ymd: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

/** The home page: pipeline counts, follow-ups, recent activity and breakdowns for everyone or one person. */
export default function Dashboard({ who, me, team, today, stats, due, warm, warmNext, conv, error }: DashboardData) {
  const nextBy = new Map(warmNext.map((n) => [n.org_id, n]));

  // ---- pipeline
  const all = tally(stats.orgs);
  const count = (s: string) => all.byStatus[s] ?? 0;

  // ---- follow-ups
  const fu = stats.follow_ups.reduce(
    (a, f) => ({ overdue: a.overdue + f.overdue, today: a.today + f.today, week: a.week + f.week, open: a.open + f.open }),
    { overdue: 0, today: 0, week: 0, open: 0 },
  );
  const overdueBy = new Map(stats.follow_ups.map((f) => [f.assignee ?? "Unassigned", f.overdue]));

  // ---- activity: last 7 days vs the 7 before
  const sumKinds = (kinds: string[], from: string, to: string) =>
    stats.activity.filter((a) => kinds.includes(a.kind) && a.day >= from && a.day <= to).reduce((s, a) => s + a.n, 0);
  const wk = (kinds: string[]) => ({
    now: sumKinds(kinds, addDays(today, -6), today),
    prev: sumKinds(kinds, addDays(today, -13), addDays(today, -7)),
  });
  const weekTiles = [
    { label: "Emails sent", ...wk(["Email sent"]) },
    { label: "Replies received", ...wk(["Email received"]) },
    { label: "Calls & voicemails", ...wk(["Call", "Voicemail"]) },
    { label: "Meetings", ...wk(["Meeting"]) },
  ];

  // ---- links that keep the current scope
  const prospects = (p: Record<string, string> = {}) => {
    const q = new URLSearchParams(who ? { assignee: who, ...p } : p);
    return `/prospects?${q.toString()}`;
  };
  const followups = (when: string) => `/followups?when=${when}&who=${encodeURIComponent(who ?? "anyone")}`;
  const scopeName = who === "unassigned" ? "unassigned prospects" : who ? (who === me ? "your prospects" : `${who}'s prospects`) : "everyone";

  const assigneeRows = (() => {
    const rows = groupBy(stats.orgs, (c) => c.assignee ?? "Unassigned");
    const names = who ? rows.map((r) => r.key) : [...team, "Unassigned"];
    return names.map((n) => rows.find((r) => r.key === n) ?? { key: n, t: tally([]) });
  })();
  // people who hold at least one prospect, in team order: the columns of the split tables
  const holders = assigneeRows.filter((r) => r.t.total > 0).map((r) => r.key);

  return (
    <>
      <div className="head">
        <h1>Dashboard</h1>
        <span className="count">{shortDate(today, { weekday: "long", month: "long", day: "numeric" })} · {scopeName}</span>
      </div>

      <nav className="chips" aria-label="Whose prospects">
        <Link href="/" className={!who ? "on" : ""}>Everyone</Link>
        {team.map((t) => (
          <Link key={t} href={`/?who=${encodeURIComponent(t)}`} className={who === t ? "on" : ""}>
            {t === me ? `${t} (me)` : t}
          </Link>
        ))}
        <Link href="/?who=unassigned" className={who === "unassigned" ? "on" : ""}>Unassigned</Link>
      </nav>

      {error && <div className="error">{error}</div>}

      <section className="kpis" aria-label="Headline numbers">
        <Link className="tile" href={prospects()}>
          <span className="lbl">Prospects</span>
          <span className="val">{all.total.toLocaleString()}</span>
          <span className="sub">{(count("Not contacted") + count("Draft ready")).toLocaleString()} not reached yet</span>
        </Link>
        <div className="tile">
          <span className="lbl">Contacted</span>
          <span className="val">{all.contacted.toLocaleString()}</span>
          <span className="sub">{pct(all.contacted, all.total)} of prospects</span>
        </div>
        <div className="tile">
          <span className="lbl">Responded</span>
          <span className="val">{all.responded.toLocaleString()}</span>
          <span className="sub">{replyRate(all)} reply rate</span>
        </div>
        <Link className="tile" href={prospects({ status: "Meeting set" })}>
          <span className="lbl">Meetings set</span>
          <span className="val">{count("Meeting set")}</span>
          <span className="sub">open conversations</span>
        </Link>
        <Link className="tile" href={prospects({ status: "Customer" })}>
          <span className="lbl">Customers</span>
          <span className="val">{count("Customer")}</span>
          <span className="sub">{pct(count("Customer"), all.contacted)} of contacted</span>
        </Link>
      </section>

      <section className="card">
        <h2>Prospects by status</h2>
        <div className="statuses">
          {PIPELINE.map((s) => (
            <Link key={s} className="tile flat" href={prospects({ status: s })}>
              <span><span className={statusClass(s)}>{s}</span></span>
              <span className="val">{count(s).toLocaleString()}</span>
              <span className="sub">{pct(count(s), all.total)} of prospects</span>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid2">
        <section className="card stack">
          <h2>Follow-ups</h2>
          <div className="minis">
            <Link className={`tile flat ${fu.overdue ? "alert" : ""}`} href={followups("overdue")}>
              <span className="lbl">Overdue</span><span className="val">{fu.overdue}</span>
            </Link>
            <Link className="tile flat" href={followups("today")}>
              <span className="lbl">Due today</span><span className="val">{fu.today}</span>
            </Link>
            <Link className="tile flat" href={followups("week")}>
              <span className="lbl">Next 7 days</span><span className="val">{fu.week}</span>
            </Link>
            <Link className="tile flat" href={followups("all")}>
              <span className="lbl">All open</span><span className="val">{fu.open}</span>
            </Link>
          </div>
          <div>
            <h3 className="sub-h">Due now</h3>
            <ul className="list">
              {due.map((f) => (
                <li key={f.id}>
                  <span className={`nowrap ${f.due_on < today ? "due-over" : "due-today"}`}>{shortDate(f.due_on)}</span>
                  <div>
                    <Link href={`/prospects/${f.org_id}`} className="org">{f.org_name}</Link>
                    <div className="small muted clamp2">{f.task}{!who && f.assignee ? ` · ${f.assignee}` : ""}</div>
                  </div>
                </li>
              ))}
              {!due.length && <li className="muted">Nothing due.</li>}
            </ul>
            {fu.overdue + fu.today > due.length && (
              <Link className="small" href={followups("due")}>See all {fu.overdue + fu.today} →</Link>
            )}
          </div>
        </section>

        <section className="card stack">
          <h2>Last 7 days</h2>
          <div className="minis">
            {weekTiles.map((w) => {
              const d = w.now - w.prev;
              return (
                <div key={w.label} className="tile flat">
                  <span className="lbl">{w.label}</span>
                  <span className="val">{w.now}</span>
                  <span className="sub">
                    {d === 0 ? "same as week before" : (
                      <><span className={d > 0 ? "up" : "down"}>{d > 0 ? "▲" : "▼"} {Math.abs(d)}</span> vs week before</>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section className="card">
        <h2>By person</h2>
        <div className="tbl flat">
          <table>
            <thead>
              <tr>
                <th>Assigned to</th>
                <th className="num">Prospects</th>
                {PIPELINE.map((s) => <th key={s} className="num">{s}</th>)}
                <th className="num" title="Responded as a share of contacted prospects whose email didn't bounce">Rate</th>
                <th className="num" title="Overdue follow-ups">Overdue</th>
              </tr>
            </thead>
            <tbody>
              {assigneeRows.map(({ key, t }) => {
                const a = key === "Unassigned" ? "unassigned" : key;
                return (
                  <tr key={key}>
                    <td className="nowrap"><Link href={`/prospects?assignee=${encodeURIComponent(a)}`} className="org">{key}</Link></td>
                    <td className="num"><b>{t.total}</b></td>
                    {PIPELINE.map((s) => (
                      <td key={s} className="num">
                        {t.byStatus[s] ? (
                          <Link href={`/prospects?assignee=${encodeURIComponent(a)}&status=${encodeURIComponent(s)}`}>{t.byStatus[s]}</Link>
                        ) : (
                          <span className="muted">0</span>
                        )}
                      </td>
                    ))}
                    <td className="num">{replyRate(t)}</td>
                    <td className="num">
                      {overdueBy.get(key) ? <span className="due-over">{overdueBy.get(key)}</span> : <span className="muted">0</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {!who && holders.length > 1 && (
        <>
          <Split
            title="Who has what"
            head="State"
            cells={stats.orgs}
            by={(c) => c.state ?? "Not recorded"}
            people={holders}
            param="state"
            linkable={(k) => (STATES as readonly string[]).includes(k)}
          />
          <div className="grid2">
            <Split
              title="Org type by person"
              head="Org type"
              cells={stats.orgs}
              by={(c) => c.category ?? "Other"}
              people={holders}
              param="category"
              linkable={(k) => k !== "Other"}
            />
            <Split
              title="Fundraising by person"
              head="Runs"
              cells={stats.orgs}
              by={(c) => c.fundraising ?? "Unknown"}
              people={holders}
              param="fundraising"
              linkable={(k) => k !== "Unknown"}
            />
          </div>
        </>
      )}

      <div className="grid2">
        <Breakdown
          title="By org type"
          head="Org type"
          groups={groupBy(stats.orgs, (c) => c.category ?? "Other")}
          href={(k) => prospects({ category: k })}
        />
        <Breakdown
          title="By fundraising"
          head="Runs"
          groups={groupBy(stats.orgs, (c) => c.fundraising ?? "Unknown")}
          href={(k) => prospects({ fundraising: k })}
        />
        <Breakdown
          title="By state"
          head="State"
          groups={groupBy(stats.orgs, (c) => c.state ?? "Not recorded")}
          href={(k) => ((STATES as readonly string[]).includes(k) ? prospects({ state: k }) : null)}
        />
        <Breakdown
          title="By contact type"
          head="Contact"
          groups={groupBy(stats.orgs, (c) => c.contact_type ?? "Not recorded")}
          href={(k) => (k === "Not recorded" ? null : prospects({ contact: k }))}
        />
      </div>

      <div className="grid2">
        <section className="card">
          <h2>Warm leads <span className="muted small">replied or meeting set</span></h2>
          <ul className="list">
            {warm.map((w) => {
              const n = nextBy.get(w.id);
              return (
                <li key={w.id}>
                  <span><span className={statusClass(w.status)}>{w.status}</span></span>
                  <div>
                    <Link href={`/prospects/${w.id}`} className="org">{w.name}</Link>
                    <div className="small muted">
                      {[[w.town, w.state].filter(Boolean).join(", "), w.last_contact && `last contact ${fmtDate(w.last_contact)}`, !who && (w.assignee ?? "Unassigned")]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                    <div className="small">
                      {n ? (
                        <>Next: <span className={n.due_on < today ? "due-over" : n.due_on === today ? "due-today" : ""}>{fmtDate(n.due_on)}</span> · {n.task}</>
                      ) : (
                        <span className="due-today">No follow-up scheduled</span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
            {!warm.length && <li className="muted">No warm leads yet.</li>}
          </ul>
        </section>

        <section className="card">
          <h2>Recent replies &amp; calls</h2>
          <ul className="timeline">
            {conv.map((a) => (
              <li key={a.id}>
                <div className={`k ${a.kind.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
                  {a.kind} · {fmtDate(a.occurred_on)}{a.by_member ? ` · ${a.by_member}` : ""}
                </div>
                <Link href={`/prospects/${a.org_id}`} className="org">{a.org_name}</Link>
                <p className="small clamp">{a.summary}</p>
              </li>
            ))}
            {!conv.length && <li className="muted">No replies or calls logged yet.</li>}
          </ul>
        </section>
      </div>
    </>
  );
}

/** One dimension of the pipeline split by assignee: a stacked bar plus each person's count, linked to their filtered list. */
function Split({ title, head, cells, by, people, param, linkable }: {
  title: string; head: string; cells: Cell[]; by: (c: Cell) => string; people: string[];
  param: string; linkable: (key: string) => boolean;
}) {
  const rows = new Map<string, Record<string, number>>();
  for (const c of cells) {
    const r = rows.get(by(c)) ?? {};
    const p = c.assignee ?? "Unassigned";
    r[p] = (r[p] ?? 0) + c.n;
    rows.set(by(c), r);
  }
  const list = [...rows]
    .map(([key, r]) => ({ key, r, total: people.reduce((s, p) => s + (r[p] ?? 0), 0) }))
    .sort((a, b) => b.total - a.total);
  const sums = people.map((p) => list.reduce((s, x) => s + (x.r[p] ?? 0), 0));
  const grand = sums.reduce((s, n) => s + n, 0);
  const max = Math.max(1, ...list.map((x) => x.total));
  const short = (p: string) => p.split(" ")[0];
  const href = (key: string | null, p: string) => {
    const q = new URLSearchParams({ assignee: p === "Unassigned" ? "unassigned" : p });
    if (key) q.set(param, key);
    return `/prospects?${q.toString()}`;
  };
  return (
    <section className="card">
      <h2>
        {title}{" "}
        <span className="legend">
          {people.map((p, i) => <span key={p}><i className={`p${i}`} />{short(p)}</span>)}
        </span>
      </h2>
      <div className="tbl flat">
        <table className="bd">
          <thead>
            <tr>
              <th>{head}</th>
              <th>Split</th>
              {people.map((p) => <th key={p} className="num">{short(p)}</th>)}
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {list.map(({ key, r, total }) => (
              <tr key={key} title={`${key}: ${people.map((p) => `${short(p)} ${r[p] ?? 0}`).join(", ")}`}>
                <td>{key}</td>
                <td>
                  <div className="sb" style={{ width: `${(100 * total) / max}%` }}>
                    {people.map((p, i) => (r[p] ? <i key={p} className={`p${i}`} style={{ flexGrow: r[p] }} /> : null))}
                  </div>
                </td>
                {people.map((p) => (
                  <td key={p} className="num">
                    {r[p] ? (linkable(key) ? <Link href={href(key, p)}>{r[p]}</Link> : r[p]) : <span className="muted">0</span>}
                  </td>
                ))}
                <td className="num"><b>{total}</b></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th>All</th>
              <th />
              {people.map((p, i) => (
                <th key={p} className="num">
                  <Link href={href(null, p)}>{sums[i].toLocaleString()}</Link>
                  <div className="small muted">{grand ? `${Math.round((100 * sums[i]) / grand)}%` : "–"}</div>
                </th>
              ))}
              <th className="num">{grand.toLocaleString()}</th>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

/** One dimension of the pipeline: prospects per value with a bar, how many were reached and how many answered. */
function Breakdown({ title, head, groups, href }: {
  title: string; head: string; groups: { key: string; t: Tally }[]; href: (key: string) => string | null;
}) {
  const max = Math.max(1, ...groups.map((g) => g.t.total));
  return (
    <section className="card">
      <h2>{title}</h2>
      <div className="tbl flat">
        <table className="bd">
          <thead>
            <tr>
              <th>{head}</th>
              <th>Prospects</th>
              <th className="num">Contacted</th>
              <th className="num">Responded</th>
              <th className="num" title="Responded as a share of contacted prospects whose email didn't bounce">Rate</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(({ key, t }) => {
              const link = href(key);
              return (
                <tr key={key} title={`${key}: ${t.total} prospects, ${t.contacted} contacted, ${t.responded} responded`}>
                  <td>{link ? <Link href={link}>{key}</Link> : key}</td>
                  <td>
                    <div className="hb">
                      <i style={{ width: `calc((100% - 3em) * ${t.total / max})` }} />
                      <b>{t.total}</b>
                    </div>
                  </td>
                  <td className="num">{t.contacted}</td>
                  <td className="num">{t.responded}</td>
                  <td className="num">{replyRate(t)}</td>
                </tr>
              );
            })}
            {!groups.length && (
              <tr><td colSpan={5} className="muted">No prospects.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
