"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentMember } from "@/lib/session";
import { REVIEW_STATUSES, todayCentral } from "@/lib/constants";

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
};

const CONTACT_KINDS = new Set(["Call", "Voicemail", "Email sent", "Email received", "Meeting"]);

function refresh(orgId?: string | null) {
  if (orgId) revalidatePath(`/prospects/${orgId}`);
  revalidatePath("/prospects");
  revalidatePath("/followups");
}

/** Edit a prospect's working fields; a status change is also written to the activity log. */
export async function updateOrg(formData: FormData) {
  const supabase = await createClient();
  const me = await currentMember();
  const id = String(formData.get("id"));
  const { data: before } = await supabase.from("orgs").select("status, assignee").eq("id", id).single();
  const patch = {
    status: str(formData, "status") ?? "Not contacted",
    assignee: str(formData, "assignee"),
    category: str(formData, "category"),
    org_type: str(formData, "org_type"),
    fundraising: str(formData, "fundraising"),
    game_status: str(formData, "game_status"),
    game_detail: str(formData, "game_detail"),
    contact_type: str(formData, "contact_type"),
    fit: str(formData, "fit"),
    town: str(formData, "town"),
    county: str(formData, "county"),
    state: str(formData, "state"),
    street: str(formData, "street"),
    website: str(formData, "website"),
    facebook: str(formData, "facebook"),
    notes: str(formData, "notes"),
  };
  const { error } = await supabase.from("orgs").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  const changes: string[] = [];
  if (before && before.status !== patch.status) changes.push(`Status: ${before.status} → ${patch.status}`);
  if (before && (before.assignee ?? null) !== patch.assignee)
    changes.push(`Assigned: ${before.assignee ?? "Unassigned"} → ${patch.assignee ?? "Unassigned"}`);
  if (changes.length)
    await supabase.from("activities").insert({ org_id: id, kind: "Status change", summary: changes.join(". "), by_member: me });
  refresh(id);
}

/** Log a call, email, meeting or note; optionally change the status and schedule the next follow-up in one step. */
export async function logActivity(formData: FormData) {
  const supabase = await createClient();
  const me = await currentMember();
  const orgId = String(formData.get("org_id"));
  const kind = str(formData, "kind") ?? "Note";
  const occurred = str(formData, "occurred_on") ?? todayCentral();
  const summary = str(formData, "summary");
  if (!summary) throw new Error("Write what happened.");
  const { error } = await supabase.from("activities").insert({
    org_id: orgId,
    kind,
    occurred_on: occurred,
    summary,
    thread_url: str(formData, "thread_url"),
    by_member: me,
  });
  if (error) throw new Error(error.message);

  const orgPatch: Record<string, string> = {};
  if (CONTACT_KINDS.has(kind)) orgPatch.last_contact = occurred;
  const newStatus = str(formData, "new_status");
  if (newStatus) orgPatch.status = newStatus;
  if (Object.keys(orgPatch).length) await supabase.from("orgs").update(orgPatch).eq("id", orgId);

  if (formData.get("close_open") === "on")
    await supabase.from("follow_ups").update({ done_at: new Date().toISOString(), done_by: me }).eq("org_id", orgId).is("done_at", null);

  const due = str(formData, "next_due");
  const task = str(formData, "next_task");
  if (due && task)
    await supabase.from("follow_ups").insert({ org_id: orgId, due_on: due, task, assignee: str(formData, "next_assignee") ?? me, created_by: me });
  refresh(orgId);
}

export async function addFollowUp(formData: FormData) {
  const supabase = await createClient();
  const me = await currentMember();
  const orgId = String(formData.get("org_id"));
  const due = str(formData, "due_on");
  const task = str(formData, "task");
  if (!due || !task) throw new Error("A follow-up needs a date and a task.");
  const { error } = await supabase
    .from("follow_ups")
    .insert({ org_id: orgId, due_on: due, task, assignee: str(formData, "assignee"), created_by: me });
  if (error) throw new Error(error.message);
  refresh(orgId);
}

export async function completeFollowUp(formData: FormData) {
  const supabase = await createClient();
  const me = await currentMember();
  const id = String(formData.get("id"));
  const { data } = await supabase
    .from("follow_ups")
    .update({ done_at: new Date().toISOString(), done_by: me })
    .eq("id", id)
    .select("org_id, task")
    .single();
  if (data) await supabase.from("activities").insert({ org_id: data.org_id, kind: "Note", summary: `Follow-up done: ${data.task}`, by_member: me });
  refresh(data?.org_id);
}

export async function snoozeFollowUp(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const days = Number(formData.get("days") || 7);
  const { data } = await supabase.from("follow_ups").select("org_id").eq("id", id).single();
  await supabase.from("follow_ups").update({ due_on: todayCentral(days) }).eq("id", id);
  refresh(data?.org_id);
}

export async function reopenFollowUp(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const { data } = await supabase.from("follow_ups").update({ done_at: null, done_by: null }).eq("id", id).select("org_id").single();
  refresh(data?.org_id);
}

export async function addContact(formData: FormData) {
  const supabase = await createClient();
  const orgId = String(formData.get("org_id"));
  const row = {
    org_id: orgId,
    name: str(formData, "name"),
    role: str(formData, "role"),
    email: str(formData, "email"),
    phone: str(formData, "phone"),
    is_primary: formData.get("is_primary") === "on",
  };
  if (!row.name && !row.email && !row.phone) throw new Error("Add a name, email or phone.");
  const { error } = await supabase.from("contacts").insert(row);
  if (error) throw new Error(error.message);
  refresh(orgId);
}

export async function deleteContact(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const { data } = await supabase.from("contacts").delete().eq("id", id).select("org_id").single();
  refresh(data?.org_id);
}

/** Link two prospects that belong together, e.g. a K of C council and its parish. Noted in both histories. */
async function addLink(orgId: string, relatedId: string, relation: string | null) {
  const supabase = await createClient();
  const me = await currentMember();
  const { error } = await supabase.from("org_links").insert({ org_id: orgId, related_id: relatedId, relation, created_by: me });
  if (error?.code === "23505") return; // these two are already linked
  if (error) throw new Error(error.message);
  const { data: names } = await supabase.from("orgs").select("id, name").in("id", [orgId, relatedId]);
  const nameOf = (id: string) => names?.find((n) => n.id === id)?.name ?? id;
  const how = relation ? ` (${relation})` : "";
  await supabase.from("activities").insert([
    { org_id: orgId, kind: "Note", summary: `Linked to ${nameOf(relatedId)}${how}.`, by_member: me },
    { org_id: relatedId, kind: "Note", summary: `Linked to ${nameOf(orgId)}${how}.`, by_member: me },
  ]);
  revalidatePath(`/prospects/${orgId}`);
  revalidatePath(`/prospects/${relatedId}`);
}

export async function linkOrgs(formData: FormData) {
  const orgId = String(formData.get("org_id"));
  await addLink(orgId, String(formData.get("related_id")), str(formData, "relation"));
  refresh(orgId);
  redirect(`/prospects/${orgId}#links`);
}

export async function unlinkOrgs(formData: FormData) {
  const supabase = await createClient();
  const { data } = await supabase.from("org_links").delete().eq("id", String(formData.get("id"))).select("org_id, related_id").single();
  if (data) revalidatePath(`/prospects/${data.related_id}`);
  refresh(data?.org_id);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REVIEWABLE = new Set<string>(REVIEW_STATUSES);

export type DraftPatch = { subject?: string; body?: string; note?: string; status?: string };

/** Save a reviewer's changes to an email draft from the Drafts page (autosave and the status buttons).
 *  Only the subject, body, notes and review status can change, and never once the draft has gone out.
 *  Returns an error message instead of throwing so the card can show "Not saved". */
export async function updateDraft(id: string, patch: DraftPatch): Promise<{ error?: string }> {
  if (typeof id !== "string" || !UUID.test(id) || !patch || typeof patch !== "object") return { error: "Bad request." };
  const me = await currentMember();
  if (!me) return { error: "You aren't on the sales team list." };

  const row: Record<string, string | null> = {};
  for (const k of ["subject", "body", "note", "status"] as const)
    if (patch[k] !== undefined && typeof patch[k] !== "string") return { error: `Bad ${k}.` };
  if (patch.subject !== undefined) {
    row.subject = patch.subject.replace(/[\r\n]+/g, " ").trim();
    if (!row.subject) return { error: "The subject can't be blank." };
    if (row.subject.length > 300) return { error: "The subject is too long." };
  }
  if (patch.body !== undefined) {
    row.body = patch.body.replace(/\r\n?/g, "\n");
    if (!row.body.trim()) return { error: "The email can't be blank." };
    if (row.body.length > 20000) return { error: "The email is too long." };
  }
  if (patch.note !== undefined) {
    row.note = patch.note.trim() || null;
    if ((row.note?.length ?? 0) > 5000) return { error: "The notes are too long." };
  }
  if (patch.status !== undefined) {
    if (!REVIEWABLE.has(patch.status)) return { error: "Bad status." };
    // back to To review means nobody has reviewed it
    const reviewed = patch.status !== "To review";
    row.status = patch.status;
    row.reviewed_by = reviewed ? me : null;
    row.reviewed_at = reviewed ? new Date().toISOString() : null;
  }
  if (!Object.keys(row).length) return {};

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("drafts")
    .update(row)
    .eq("id", id)
    .not("status", "in", "(Sent,Bounced)")
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "This draft has already gone out or no longer exists, so it can't be changed." };
  revalidatePath("/drafts");
  return {};
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

export async function createOrg(formData: FormData) {
  const supabase = await createClient();
  const me = await currentMember();
  const name = str(formData, "name");
  if (!name) throw new Error("A prospect needs a name.");
  const id = `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;
  const { error } = await supabase.from("orgs").insert({
    id,
    name,
    category: str(formData, "category"),
    org_type: str(formData, "org_type"),
    status: str(formData, "status") ?? "Not contacted",
    assignee: str(formData, "assignee"),
    fundraising: str(formData, "fundraising"),
    contact_type: str(formData, "contact_type"),
    town: str(formData, "town"),
    state: str(formData, "state"),
    website: str(formData, "website"),
    notes: str(formData, "notes"),
    source_list: "Added in CRM",
  });
  if (error) throw new Error(error.message);
  const c = { name: str(formData, "c_name"), role: str(formData, "c_role"), email: str(formData, "c_email"), phone: str(formData, "c_phone") };
  if (c.name || c.email || c.phone) await supabase.from("contacts").insert({ org_id: id, ...c, is_primary: true });
  await supabase.from("activities").insert({ org_id: id, kind: "Note", summary: "Added to the CRM.", by_member: me });
  const linkTo = str(formData, "link_to");
  if (linkTo) await addLink(linkTo, id, str(formData, "relation"));
  redirect(`/prospects/${id}`);
}
