import Link from "next/link";
import { notFound } from "next/navigation";
import Shell from "@/components/Shell";
import Select from "@/components/Select";
import { createClient } from "@/lib/supabase/server";
import { currentMember, teamNames } from "@/lib/session";
import {
  addContact, addFollowUp, completeFollowUp, deleteContact, linkOrgs, logActivity, reopenFollowUp, snoozeFollowUp, unlinkOrgs, updateOrg,
} from "@/app/actions";
import {
  ACTIVITY_KINDS, CATEGORIES, CONTACT_TYPES, FITS, FUNDRAISING, GAME_STATUSES, STATUSES, fmtDate, statusClass, todayCentral,
} from "@/lib/constants";

type OrgBrief = { id: string; name: string; town: string | null; state: string | null; status: string };
type OrgLink = { id: string; relation: string | null; other: OrgBrief };
const BRIEF = "id,name,town,state,status";

export default async function ProspectPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ linkq?: string }> }) {
  const { id } = await params;
  const linkq = ((await searchParams).linkq ?? "").trim();
  const supabase = await createClient();

  // "Link a related prospect" search: every word has to appear in the name
  let find = supabase.from("orgs").select(BRIEF).neq("id", id);
  for (const w of linkq.split(/\s+/).filter(Boolean)) find = find.ilike("name", `%${w.replace(/[%_\\]/g, "\\$&")}%`);

  const [{ data: org }, { data: contacts }, { data: acts }, { data: fups }, { data: linksOut }, { data: linksIn }, { data: found }, team, me] =
    await Promise.all([
      supabase.from("orgs").select("*").eq("id", id).maybeSingle(),
      supabase.from("contacts").select("*").eq("org_id", id).order("is_primary", { ascending: false }).order("created_at"),
      supabase.from("activities").select("*").eq("org_id", id).order("occurred_on", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("follow_ups").select("*").eq("org_id", id).order("done_at", { ascending: true, nullsFirst: true }).order("due_on"),
      supabase.from("org_links").select(`id, relation, other:orgs!org_links_related_id_fkey(${BRIEF})`).eq("org_id", id),
      supabase.from("org_links").select(`id, relation, other:orgs!org_links_org_id_fkey(${BRIEF})`).eq("related_id", id),
      linkq ? find.order("name").limit(12) : Promise.resolve({ data: [] }),
      teamNames(),
      currentMember(),
    ]);
  if (!org) notFound();
  const today = todayCentral();
  const open = (fups ?? []).filter((f) => !f.done_at);
  const done = (fups ?? []).filter((f) => f.done_at);
  const teamOpts = team.map((t) => ({ value: t, label: t }));
  const sources: string[] = Array.isArray(org.sources) ? org.sources : [];
  const links = ([...(linksOut ?? []), ...(linksIn ?? [])] as unknown as OrgLink[])
    .filter((l) => l.other)
    .sort((a, b) => a.other.name.localeCompare(b.other.name));
  const linked = new Set(links.map((l) => l.other.id));
  const matches = (found ?? []) as OrgBrief[];

  return (
    <Shell active="prospects">
      <div className="head">
        <h1>{org.name}</h1>
        <span className={statusClass(org.status)}>{org.status}</span>
        <span className="muted">
          {[org.town, org.county && `${org.county} County`, org.state].filter(Boolean).join(", ")}
          {org.assignee ? ` · ${org.assignee}` : " · Unassigned"}
        </span>
        <Link className="right small" href="/prospects">← All prospects</Link>
      </div>

      <div className="grid3">
        {/* left: what to do next, history */}
        <div className="stack">
          <section className="card">
            <h2>Log activity</h2>
            <form action={logActivity} className="stack">
              <input type="hidden" name="org_id" value={org.id} />
              <div className="row">
                <Select label="What happened" name="kind" value="Call" options={ACTIVITY_KINDS.filter((k) => k !== "Status change")} any={null} />
                <label>
                  Date
                  <input id="occurred_on" name="occurred_on" type="date" defaultValue={today} />
                </label>
                <Select label="Change status to" name="new_status" options={STATUSES} any="(no change)" />
              </div>
              <label>
                Notes
                <textarea id="summary" name="summary" required placeholder="Who you talked to, what they said, what you promised" />
              </label>
              <label>
                Email thread link (optional)
                <input id="thread_url" name="thread_url" placeholder="https://mail.google.com/..." />
              </label>
              <div className="row">
                <label>
                  Next follow-up date
                  <input id="next_due" name="next_due" type="date" />
                </label>
                <label style={{ flex: "2 1 220px" }}>
                  Next step
                  <input id="next_task" name="next_task" placeholder="e.g. Call back and ask for Radar" />
                </label>
                <Select label="For" name="next_assignee" value={org.assignee ?? me} options={teamOpts} any="Unassigned" />
              </div>
              {open.length > 0 && (
                <label style={{ flexDirection: "row", alignItems: "center", gap: 6, fontWeight: 600 }}>
                  <input type="checkbox" name="close_open" defaultChecked /> Close the {open.length} open follow-up{open.length > 1 ? "s" : ""}
                </label>
              )}
              <div><button className="btn" type="submit">Save activity</button></div>
            </form>
          </section>

          <section className="card">
            <h2>Follow-ups</h2>
            {!open.length && <p className="muted small" style={{ marginTop: 0 }}>No follow-up scheduled.</p>}
            <ul className="timeline">
              {open.map((f) => {
                const cls = f.due_on < today ? "due-over" : f.due_on === today ? "due-today" : "";
                return (
                  <li key={f.id}>
                    <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <span className={cls}>{fmtDate(f.due_on)}</span> · {f.task}
                        <div className="small muted">{f.assignee ?? "Unassigned"}</div>
                      </div>
                      <div className="row" style={{ gap: 6 }}>
                        <form action={completeFollowUp}><input type="hidden" name="id" value={f.id} /><button className="btn sm go">Done</button></form>
                        <form action={snoozeFollowUp}><input type="hidden" name="id" value={f.id} /><input type="hidden" name="days" value="7" /><button className="btn sm ghost">+1 week</button></form>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <form action={addFollowUp} className="row" style={{ marginTop: 12 }}>
              <input type="hidden" name="org_id" value={org.id} />
              <label>
                Date
                <input id="fu_due" name="due_on" type="date" required defaultValue={todayCentral(7)} />
              </label>
              <label style={{ flex: "2 1 220px" }}>
                Task
                <input id="fu_task" name="task" required placeholder="What needs doing" />
              </label>
              <Select label="For" name="assignee" value={org.assignee ?? me} options={teamOpts} any="Unassigned" />
              <button className="btn ghost" type="submit">Schedule</button>
            </form>
            {done.length > 0 && (
              <details style={{ marginTop: 10 }}>
                <summary className="small muted">{done.length} completed</summary>
                <ul className="timeline" style={{ marginTop: 8 }}>
                  {done.map((f) => (
                    <li key={f.id} className="small">
                      {fmtDate(f.due_on)} · {f.task} <span className="muted">(done {fmtDate(f.done_at)}{f.done_by ? ` by ${f.done_by}` : ""})</span>
                      <form action={reopenFollowUp} style={{ display: "inline", marginLeft: 6 }}>
                        <input type="hidden" name="id" value={f.id} />
                        <button className="btn sm ghost">Reopen</button>
                      </form>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>

          <section className="card">
            <h2>History ({acts?.length ?? 0})</h2>
            <ul className="timeline">
              {(acts ?? []).map((a) => (
                <li key={a.id}>
                  <div className="small">
                    <span className={`k ${a.kind.toLowerCase().split(" ")[0]}`}>{a.kind}</span>{" "}
                    <span className="muted">{fmtDate(a.occurred_on)}{a.by_member ? ` · ${a.by_member}` : ""}</span>
                    {a.thread_url && <> · <a href={a.thread_url} target="_blank" rel="noopener">email thread</a></>}
                  </div>
                  <p>{a.summary}</p>
                </li>
              ))}
              {!acts?.length && <li className="muted small">Nothing logged yet.</li>}
            </ul>
          </section>
        </div>

        {/* right: who, what they run, editable fields */}
        <div className="stack">
          <section className="card">
            <h2>Contacts</h2>
            <ul className="timeline">
              {(contacts ?? []).map((c) => (
                <li key={c.id}>
                  <div><strong>{c.name || "No name"}</strong>{c.role ? <span className="muted">, {c.role}</span> : null}{c.is_primary ? <span className="small muted"> · primary</span> : null}</div>
                  {c.email && <div className="small"><a href={`mailto:${c.email}`}>{c.email}</a></div>}
                  {c.phone && <div className="small">{c.phone}</div>}
                  <form action={deleteContact}><input type="hidden" name="id" value={c.id} /><button className="btn sm ghost" title="Remove this contact">Remove</button></form>
                </li>
              ))}
              {!contacts?.length && <li className="muted small">No contacts yet.</li>}
            </ul>
            <details style={{ marginTop: 10 }}>
              <summary className="small">Add a contact</summary>
              <form action={addContact} className="stack" style={{ marginTop: 8 }}>
                <input type="hidden" name="org_id" value={org.id} />
                <div className="row">
                  <label>Name<input id="c_name" name="name" /></label>
                  <label>Role<input id="c_role" name="role" /></label>
                </div>
                <div className="row">
                  <label>Email<input id="c_email" name="email" type="email" /></label>
                  <label>Phone<input id="c_phone" name="phone" /></label>
                </div>
                <label style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><input type="checkbox" name="is_primary" /> Primary contact</label>
                <div><button className="btn sm">Add contact</button></div>
              </form>
            </details>
          </section>

          <section className="card" id="links">
            <h2>Related organizations</h2>
            <ul className="timeline">
              {links.map((l) => (
                <li key={l.id}>
                  <div>
                    <Link className="org" href={`/prospects/${l.other.id}`}>{l.other.name}</Link>{" "}
                    <span className={statusClass(l.other.status)}>{l.other.status}</span>
                  </div>
                  <div className="small muted">
                    {[l.other.town, l.other.state].filter(Boolean).join(", ")}
                    {l.relation ? ` · ${l.relation}` : ""}
                  </div>
                  <form action={unlinkOrgs}><input type="hidden" name="id" value={l.id} /><button className="btn sm ghost" title="Remove this link">Remove</button></form>
                </li>
              ))}
              {!links.length && <li className="muted small">None yet. Link a parish, council, school or club that goes with this one.</li>}
            </ul>
            <details style={{ marginTop: 10 }} open={!!linkq}>
              <summary className="small">Link a related prospect</summary>
              <form action={`/prospects/${org.id}#links`} className="row" style={{ marginTop: 8 }}>
                <label style={{ flex: "2 1 200px" }}>Find by name<input id="linkq" name="linkq" defaultValue={linkq} placeholder="e.g. St. Agnes" /></label>
                <button className="btn sm ghost" type="submit">Search</button>
              </form>
              {linkq && (
                <ul className="timeline" style={{ marginTop: 10 }}>
                  {matches.map((m) => (
                    <li key={m.id}>
                      <div>
                        <strong>{m.name}</strong>{" "}
                        <span className="small muted">{[m.town, m.state].filter(Boolean).join(", ")}</span>
                      </div>
                      {linked.has(m.id) ? (
                        <div className="small muted">Already linked</div>
                      ) : (
                        <form action={linkOrgs} className="row" style={{ marginTop: 4 }}>
                          <input type="hidden" name="org_id" value={org.id} />
                          <input type="hidden" name="related_id" value={m.id} />
                          <label style={{ flex: "2 1 180px" }}>How they&apos;re connected<input name="relation" placeholder="e.g. Council's home parish" /></label>
                          <button className="btn sm">Link</button>
                        </form>
                      )}
                    </li>
                  ))}
                  <li className="small muted">
                    {matches.length ? "Not here? " : `No prospect matches "${linkq}". `}
                    <Link href={`/prospects/new?link=${encodeURIComponent(org.id)}&name=${encodeURIComponent(linkq)}`}>Add it as a new prospect</Link> and it will be linked to {org.name}.
                  </li>
                </ul>
              )}
            </details>
          </section>

          <section className="card">
            <h2>What they run</h2>
            <dl className="facts">
              {org.fundraising && (<><dt>Fundraising</dt><dd>{org.fundraising}{org.game_status ? ` (${org.game_status})` : ""}</dd></>)}
              {org.game_detail && (<><dt>Details</dt><dd>{org.game_detail}</dd></>)}
              {org.pitch && (<><dt>Pitch</dt><dd>{org.pitch}</dd></>)}
              {org.fit && (<><dt>Fit</dt><dd>{org.fit}</dd></>)}
              {org.diocese && (<><dt>Diocese</dt><dd>{org.diocese}</dd></>)}
              {org.street && (<><dt>Address</dt><dd>{org.street}</dd></>)}
              {org.website && (<><dt>Website</dt><dd><a href={org.website} target="_blank" rel="noopener">{org.website}</a></dd></>)}
              {org.facebook && (<><dt>Facebook</dt><dd><a href={org.facebook} target="_blank" rel="noopener">Facebook page</a></dd></>)}
              {org.source_list && (<><dt>Source list</dt><dd>{org.source_list}</dd></>)}
              {org.first_contact && (<><dt>First contact</dt><dd>{fmtDate(org.first_contact)}</dd></>)}
              {org.last_contact && (<><dt>Last contact</dt><dd>{fmtDate(org.last_contact)}</dd></>)}
            </dl>
            {org.evidence && (<><h2 style={{ marginTop: 12 }}>What the research found</h2><p className="pre">{org.evidence}</p></>)}
            {sources.length > 0 && (
              <p className="small">{sources.slice(0, 6).map((s, i) => (<span key={i}><a href={s} target="_blank" rel="noopener">source {i + 1}</a>{i < Math.min(sources.length, 6) - 1 ? " · " : ""}</span>))}</p>
            )}
            {org.draft_body && (
              <details>
                <summary className="small">Email we sent or drafted{org.draft_subject ? `: ${org.draft_subject}` : ""}</summary>
                <p className="pre">{org.draft_body}</p>
              </details>
            )}
          </section>

          <section className="card">
            <h2>Edit details</h2>
            <form action={updateOrg} className="stack">
              <input type="hidden" name="id" value={org.id} />
              <div className="row">
                <Select label="Status" name="status" value={org.status} options={STATUSES} any={null} />
                <Select label="Assigned to" name="assignee" value={org.assignee} options={teamOpts} any="Unassigned" />
              </div>
              <div className="row">
                <Select label="Org type" name="category" value={org.category} options={CATEGORIES} any="(none)" />
                <label>Type detail<input id="org_type" name="org_type" defaultValue={org.org_type ?? ""} /></label>
              </div>
              <div className="row">
                <Select label="Fundraising" name="fundraising" value={org.fundraising} options={FUNDRAISING} any="(none)" />
                <Select label="Game" name="game_status" value={org.game_status} options={GAME_STATUSES} any="(none)" />
              </div>
              <label>Game details<input id="game_detail" name="game_detail" defaultValue={org.game_detail ?? ""} /></label>
              <div className="row">
                <Select label="Contact type" name="contact_type" value={org.contact_type} options={CONTACT_TYPES} any="(none)" />
                <Select label="Fit" name="fit" value={org.fit} options={FITS} any="(none)" />
              </div>
              <div className="row">
                <label>Town<input id="town" name="town" defaultValue={org.town ?? ""} /></label>
                <label>County<input id="county" name="county" defaultValue={org.county ?? ""} /></label>
                <label style={{ flex: "0 1 70px" }}>State<input id="state" name="state" defaultValue={org.state ?? ""} /></label>
              </div>
              <label>Address<input id="street" name="street" defaultValue={org.street ?? ""} /></label>
              <div className="row">
                <label>Website<input id="website" name="website" defaultValue={org.website ?? ""} /></label>
                <label>Facebook<input id="facebook" name="facebook" defaultValue={org.facebook ?? ""} /></label>
              </div>
              <label>Notes<textarea id="notes" name="notes" defaultValue={org.notes ?? ""} /></label>
              <div><button className="btn" type="submit">Save details</button></div>
            </form>
          </section>
        </div>
      </div>
    </Shell>
  );
}
