import Shell from "@/components/Shell";
import Select from "@/components/Select";
import { createOrg } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";
import { currentMember, teamNames } from "@/lib/session";
import { CATEGORIES, CONTACT_TYPES, FUNDRAISING, STATUSES } from "@/lib/constants";

/** ?link=<org id> comes from "Related organizations" on a prospect: the new prospect is linked to that one. */
export default async function NewProspectPage({ searchParams }: { searchParams: Promise<{ link?: string; name?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [team, me, { data: linkOrg }] = await Promise.all([
    teamNames(),
    currentMember(),
    sp.link ? supabase.from("orgs").select("id, name").eq("id", sp.link).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return (
    <Shell active="new">
      <div className="head"><h1>Add a prospect</h1></div>
      <form action={createOrg} className="card stack" style={{ maxWidth: 760 }}>
        <label>Organization name<input id="name" name="name" required defaultValue={sp.name ?? ""} placeholder="e.g. Washington Lions Club" /></label>
        {linkOrg && (
          <div className="row">
            <input type="hidden" name="link_to" value={linkOrg.id} />
            <label style={{ flex: "2 1 260px" }}>
              Related to {linkOrg.name}: how they&apos;re connected
              <input id="relation" name="relation" placeholder="e.g. Council's home parish" />
            </label>
          </div>
        )}
        <div className="row">
          <Select label="Org type" name="category" options={CATEGORIES} any="(choose)" />
          <label>Type detail<input id="org_type" name="org_type" placeholder="e.g. Lions club" /></label>
        </div>
        <div className="row">
          <label>Town<input id="town" name="town" /></label>
          <label style={{ flex: "0 1 80px" }}>State<input id="state" name="state" maxLength={2} /></label>
          <label>Website<input id="website" name="website" /></label>
        </div>
        <div className="row">
          <Select label="Status" name="status" value="Not contacted" options={STATUSES} any={null} />
          <Select label="Assigned to" name="assignee" value={me} options={team.map((t) => ({ value: t, label: t }))} any="Unassigned" />
          <Select label="Fundraising" name="fundraising" options={FUNDRAISING} any="(unknown)" />
          <Select label="Contact type" name="contact_type" options={CONTACT_TYPES} any="(choose)" />
        </div>
        <h2 style={{ marginTop: 6 }}>Main contact</h2>
        <div className="row">
          <label>Name<input id="c_name" name="c_name" /></label>
          <label>Role<input id="c_role" name="c_role" /></label>
        </div>
        <div className="row">
          <label>Email<input id="c_email" name="c_email" type="email" /></label>
          <label>Phone<input id="c_phone" name="c_phone" /></label>
        </div>
        <label>Notes<textarea id="notes" name="notes" /></label>
        <div><button className="btn" type="submit">Add prospect</button></div>
      </form>
    </Shell>
  );
}
