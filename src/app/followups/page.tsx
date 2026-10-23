import Link from "next/link";
import Shell from "@/components/Shell";
import Select from "@/components/Select";
import { createClient } from "@/lib/supabase/server";
import { currentMember, teamNames } from "@/lib/session";
import { completeFollowUp, snoozeFollowUp } from "@/app/actions";
import { CATEGORIES, FUNDRAISING, STATUSES, fmtDate, statusClass, todayCentral } from "@/lib/constants";

type SP = Record<string, string | undefined>;

const WHEN = [
  { value: "due", label: "Due now (today and overdue)" },
  { value: "overdue", label: "Overdue only" },
  { value: "today", label: "Today" },
  { value: "week", label: "Next 7 days" },
  { value: "all", label: "All open" },
];

export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const team = await teamNames();
  const me = await currentMember();
  const when = sp.when || "due";
  // Default to "mine" the first time; "anyone" shows everyone's.
  const who = sp.who ?? (me ? me : "");
  const today = todayCentral();

  let q = supabase
    .from("open_follow_ups")
    .select("id,org_id,due_on,task,assignee,org_name,org_status,category,fundraising,state,town,org_assignee")
    .limit(500);
  if (when === "due") q = q.lte("due_on", today);
  else if (when === "overdue") q = q.lt("due_on", today);
  else if (when === "today") q = q.eq("due_on", today);
  else if (when === "week") q = q.lte("due_on", todayCentral(7));
  if (who === "unassigned") q = q.is("assignee", null);
  else if (who && who !== "anyone") q = q.eq("assignee", who);
  if (sp.status) q = q.eq("org_status", sp.status);
  if (sp.category) q = q.eq("category", sp.category);
  if (sp.fundraising) q = q.eq("fundraising", sp.fundraising);
  if (sp.state) q = q.eq("state", sp.state);
  q = sp.sort === "org" ? q.order("org_name") : q.order("due_on").order("org_name");

  const { data: rows, error } = await q;

  return (
    <Shell active="followups">
      <div className="head">
        <h1>Follow-ups</h1>
        <span className="count">{rows?.length ?? 0} shown</span>
      </div>

      <form className="card filters" method="get">
        <Select label="When" name="when" value={when} options={WHEN} any={null} />
        <Select
          label="Assigned to"
          name="who"
          value={who}
          any={null}
          options={[
            { value: "anyone", label: "Anyone" },
            ...team.map((t) => ({ value: t, label: t === me ? `${t} (me)` : t })),
            { value: "unassigned", label: "Unassigned" },
          ]}
        />
        <Select label="Prospect status" name="status" value={sp.status} options={STATUSES} />
        <Select label="Org type" name="category" value={sp.category} options={CATEGORIES} />
        <Select label="Fundraising" name="fundraising" value={sp.fundraising} options={FUNDRAISING} />
        <Select
          label="Sort"
          name="sort"
          value={sp.sort}
          any={null}
          options={[
            { value: "due", label: "Due date" },
            { value: "org", label: "Organization" },
          ]}
        />
        <button className="btn" type="submit">Show</button>
      </form>

      {error && <div className="error">{error.message}</div>}

      <div className="tbl">
        <table>
          <thead>
            <tr>
              <th>Due</th>
              <th>Organization</th>
              <th>Task</th>
              <th>Status</th>
              <th>Assigned</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => {
              const cls = r.due_on < today ? "due-over" : r.due_on === today ? "due-today" : "";
              return (
                <tr key={r.id}>
                  <td className={`nowrap ${cls}`}>{fmtDate(r.due_on)}</td>
                  <td>
                    <Link href={`/prospects/${r.org_id}`} className="org">{r.org_name}</Link>
                    <div className="small muted">{[r.town, r.state].filter(Boolean).join(", ")} · {r.category ?? "Other"}{r.fundraising ? ` · ${r.fundraising}` : ""}</div>
                  </td>
                  <td>{r.task}</td>
                  <td><span className={statusClass(r.org_status)}>{r.org_status}</span></td>
                  <td className="nowrap">{r.assignee ?? <span className="muted">Unassigned</span>}</td>
                  <td className="nowrap">
                    <div className="row" style={{ gap: 6 }}>
                      <form action={completeFollowUp}>
                        <input type="hidden" name="id" value={r.id} />
                        <button className="btn sm go" type="submit">Done</button>
                      </form>
                      <form action={snoozeFollowUp}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="days" value="7" />
                        <button className="btn sm ghost" type="submit" title="Move to one week from today">+1 week</button>
                      </form>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!rows?.length && (
              <tr>
                <td colSpan={6} className="muted">Nothing here. Try “All open” or “Anyone”.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="small muted">“Done” closes the follow-up and notes it in the prospect’s history. To log what happened and set the next step, open the prospect.</p>
    </Shell>
  );
}
