import Link from "next/link";
import { signOut } from "@/app/auth-actions";
import { createClient } from "@/lib/supabase/server";
import { currentMember } from "@/lib/session";
import { todayCentral } from "@/lib/constants";

/** Page frame: header with navigation, overdue count and sign-out. */
export default async function Shell({ active, children }: { active: string; children: React.ReactNode }) {
  const supabase = await createClient();
  const me = await currentMember();
  const { count: due } = await supabase
    .from("follow_ups")
    .select("id", { count: "exact", head: true })
    .is("done_at", null)
    .lte("due_on", todayCentral());

  const tabs = [
    { href: "/followups", label: "Follow-ups", key: "followups" },
    { href: "/prospects", label: "Prospects", key: "prospects" },
    { href: "/prospects/new", label: "+ Add prospect", key: "new" },
  ];
  return (
    <>
      <header className="top">
        <div className="top-in">
          <Link href="/followups" className="brand">
            GRD <span>Sales</span>
          </Link>
          <nav className="nav" aria-label="Main">
            {tabs.map((t) => (
              <Link key={t.key} href={t.href} className={active === t.key ? "on" : ""}>
                {t.label}
                {t.key === "followups" && !!due && <span className="badge" title="Due today or overdue">{due}</span>}
              </Link>
            ))}
          </nav>
          <div className="who">
            <span>{me ?? "Not on the team list"}</span>
            <form action={signOut}>
              <button type="submit">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main>
        {!me && (
          <div className="error">
            You are signed in, but your email isn&apos;t on the sales team list, so no data is shown. Ask Lou to add it.
          </div>
        )}
        {children}
      </main>
    </>
  );
}
