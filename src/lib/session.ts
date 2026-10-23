import { createClient } from "@/lib/supabase/server";

/** The signed-in user's team-member name (e.g. "Lou Rolwes"), or null. */
export async function currentMember(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("current_member");
  return (data as string | null) ?? null;
}

export async function teamNames(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("team_members").select("name").eq("active", true).order("name");
  return (data ?? []).map((r: { name: string }) => r.name);
}
