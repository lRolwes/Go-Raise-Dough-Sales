import Link from "next/link";
import Shell from "@/components/Shell";
import Select from "@/components/Select";
import { createClient } from "@/lib/supabase/server";
import { teamNames } from "@/lib/session";
import {
  CATEGORIES, CONTACT_TYPES, FITS, FUNDRAISING, GAME_STATUSES, STATES, STATUSES, fmtDate, statusClass, todayCentral,
} from "@/lib/constants";

const PAGE = 100;
type SP = Record<string, string | undefined>;

export default async function ProspectsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const team = await teamNames();
  const page = Math.max(1, Number(sp.page || 1));
  const sort = sp.sort || "name";

  let q = supabase
    .from("orgs")
    .select("id,name,category,org_type,status,assignee,fundraising,game_status,town,state,contact_type,fit,last_contact", { count: "exact" });
  if (sp.q) {
    const term = sp.q.replace(/[%,()]/g, " ").trim();
    q = q.or(`name.ilike.%${term}%,town.ilike.%${term}%,county.ilike.%${term}%,notes.ilike.%${term}%`);
  }
  if (sp.status) q = q.eq("status", sp.status);
  if (sp.assignee === "unassigned") q = q.is("assignee", null);
  else if (sp.assignee) q = q.eq("assignee", sp.assignee);
  if (sp.category) q = q.eq("category", sp.category);
  if (sp.fundraising) q = q.eq("fundraising", sp.fundraising);
  if (sp.game) q = q.eq("game_status", sp.game);
  if (sp.contact) q = q.eq("contact_type", sp.contact);
  if (sp.fit) q = q.eq("fit", sp.fit);
  if (sp.state === "other") q = q.not("state", "in", `(${STATES.join(",")})`);
  else if (sp.state) q = q.eq("state", sp.state);

  if (sort === "last_contact") q = q.order("last_contact", { ascending: false, nullsFirst: false });
  else if (sort === "updated") q = q.order("updated_at", { ascending: false });
  else if (sort === "state") q = q.order("state").order("town").order("name");
  else q = q.order("name");
  q = q.range((page - 1) * PAGE, page * PAGE - 1);

  const { data: rows, count, error } = await q;
  const ids = (rows ?? []).map((r) => r.id);
  const { data: nexts } = ids.length
    ? await supabase.from("org_next_follow_up").select("org_id,due_on,task").in("org_id", ids)
    : { data: [] as { org_id: string; due_on: string; task: string }[] };
  const nextBy = new Map((nexts ?? []).map((n) => [n.org_id, n]));
  const today = todayCentral();

  const qs = (patch: SP) => {
    const p = new URLSearchParams();
    Object.entries({ ...sp, ...patch }).forEach(([k, v]) => v && p.set(k, v));
    return `/prospects?${p.toString()}`;
  };
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <Shell active="prospects">
      <div className="head">
        <h1>Prospects</h1>
        <span className="count">{total.toLocaleString()} match</span>
        <Link className="btn sm right" href="/prospects/new">+ Add prospect</Link>
      </div>

      <form className="card filters" method="get">
        <label className="wide">
          Search name, town or notes
          <input id="f-q" name="q" defaultValue={sp.q ?? ""} placeholder="e.g. Elks, Springfield, Queen" />
        </label>
        <Select label="Status" name="status" value={sp.status} options={STATUSES} />
        <Select
          label="Assigned to"
          name="assignee"
          value={sp.assignee}
          options={[...team.map((t) => ({ value: t, label: t })), { value: "unassigned", label: "Unassigned" }]}
          any="Anyone"
        />
        <Select label="Org type" name="category" value={sp.category} options={CATEGORIES} />
        <Select label="State" name="state" value={sp.state} options={[...STATES.map((s) => ({ value: s, label: s })), { value: "other", label: "Other" }]} />
        <Select label="Fundraising" name="fundraising" value={sp.fundraising} options={FUNDRAISING} />
        <Select label="Game" name="game" value={sp.game} options={GAME_STATUSES} />
        <Select label="Contact" name="contact" value={sp.contact} options={CONTACT_TYPES} />
        <Select label="Fit" name="fit" value={sp.fit} options={FITS} />
        <Select
          label="Sort"
          name="sort"
          value={sort}
          any={null}
          options={[
            { value: "name", label: "Name" },
            { value: "last_contact", label: "Last contact" },
            { value: "updated", label: "Recently changed" },
            { value: "state", label: "State, town" },
          ]}
        />
        <button className="btn" type="submit">Filter</button>
        <Link href="/prospects" className="small">Clear</Link>
      </form>

      {error && <div className="error">{error.message}</div>}

      <div className="tbl">
        <table>
          <thead>
            <tr>
              <th>Organization</th>
              <th>Where</th>
              <th>Type</th>
              <th>Fundraising</th>
              <th>Status</th>
              <th>Assigned</th>
              <th>Next follow-up</th>
              <th>Last contact</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => {
              const n = nextBy.get(r.id);
              const cls = n ? (n.due_on < today ? "due-over" : n.due_on === today ? "due-today" : "") : "";
              return (
                <tr key={r.id}>
                  <td>
                    <Link href={`/prospects/${r.id}`} className="org">{r.name}</Link>
                    <div className="small muted">{[r.org_type, r.contact_type].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td className="nowrap">{[r.town, r.state].filter(Boolean).join(", ")}</td>
                  <td>{r.category}</td>
                  <td>
                    {r.fundraising}
                    {r.game_status && <div className="small muted">{r.game_status}</div>}
                  </td>
                  <td><span className={statusClass(r.status)}>{r.status}</span></td>
                  <td className="nowrap">{r.assignee ?? <span className="muted">Unassigned</span>}</td>
                  <td>
                    {n ? (
                      <>
                        <span className={cls}>{fmtDate(n.due_on)}</span>
                        <div className="small muted">{n.task}</div>
                      </>
                    ) : (
                      <span className="muted">None</span>
                    )}
                  </td>
                  <td className="nowrap">{fmtDate(r.last_contact)}</td>
                </tr>
              );
            })}
            {!rows?.length && (
              <tr>
                <td colSpan={8} className="muted">No prospects match these filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="pager">
          {page > 1 && <Link href={qs({ page: String(page - 1) })}>← Previous</Link>}
          <span className="muted">Page {page} of {pages}</span>
          {page < pages && <Link href={qs({ page: String(page + 1) })}>Next →</Link>}
        </div>
      )}
    </Shell>
  );
}
