import Shell from "@/components/Shell";
import Dashboard, { type DashboardData, type Stats } from "@/components/Dashboard";
import { createClient } from "@/lib/supabase/server";
import { currentMember, teamNames } from "@/lib/session";
import { todayCentral } from "@/lib/constants";

type SP = Record<string, string | undefined>;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [team, me] = await Promise.all([teamNames(), currentMember()]);
  const who = sp.who === "unassigned" || (sp.who && team.includes(sp.who)) ? sp.who : null;
  const today = todayCentral();

  /** Limit a query to the chosen person's (or the unassigned) prospects. */
  const scoped = <Q,>(q: Q, col: string): Q => {
    const b = q as unknown as { is: (c: string, v: null) => Q; eq: (c: string, v: string) => Q };
    return who === "unassigned" ? b.is(col, null) : who ? b.eq(col, who) : q;
  };

  const [statsRes, dueRes, warmRes, convRes] = await Promise.all([
    supabase.rpc("dashboard_stats", { p_who: who, p_today: today }),
    scoped(
      supabase.from("open_follow_ups").select("id,org_id,org_name,due_on,task,assignee").lte("due_on", today),
      "assignee",
    ).order("due_on").order("org_name").limit(6),
    scoped(
      supabase.from("orgs").select("id,name,status,town,state,assignee,last_contact").in("status", ["Replied", "Meeting set"]),
      "assignee",
    ).order("last_contact", { ascending: false, nullsFirst: false }).limit(12),
    scoped(
      supabase
        .from("activities")
        .select("id,org_id,occurred_on,kind,summary,by_member,orgs!inner(name,assignee)")
        .in("kind", ["Email received", "Call", "Voicemail", "Meeting"]),
      "orgs.assignee",
    ).order("occurred_on", { ascending: false }).order("created_at", { ascending: false }).limit(10),
  ]);

  const warm = warmRes.data ?? [];
  const { data: warmNext } = warm.length
    ? await supabase.from("org_next_follow_up").select("org_id,due_on,task").in("org_id", warm.map((w) => w.id))
    : { data: [] };

  const data: DashboardData = {
    who, me, team, today,
    stats: (statsRes.data as Stats | null) ?? { orgs: [], follow_ups: [], activity: [] },
    due: dueRes.data ?? [],
    warm,
    warmNext: warmNext ?? [],
    conv: (convRes.data ?? []).map((a) => ({ ...a, org_name: (a.orgs as unknown as { name: string } | null)?.name ?? "" })),
    error: (statsRes.error ?? dueRes.error ?? warmRes.error ?? convRes.error)?.message ?? null,
  };

  return (
    <Shell active="dashboard">
      <Dashboard {...data} />
    </Shell>
  );
}
