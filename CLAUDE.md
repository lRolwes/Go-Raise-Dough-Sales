# GRD Sales CRM — notes for Claude

Read `README.md` first for what the app does and the data model.

## Updating records for Lou

Lou asks Claude to log calls, emails and follow-ups conversationally. Do it directly in the database with the Supabase MCP (`execute_sql`, project `fospkpvttcdtulttcqjl`), not through the app. Schema changes go through `apply_migration` and get a matching file in `supabase/migrations/`.

- Logging an email or call: insert into `activities` (`kind`, `summary`, `occurred_on`, `by_member`), set `orgs.last_contact`, and update `orgs.status` when it changes.
- Scheduling: insert into `follow_ups` (`due_on`, `task`, `assignee`, `created_by`). Completing: set `done_at = now()` and `done_by`.
- When a new contact is sent an email, close that org's open follow-ups and schedule the next one, the way `logActivity` in `src/app/actions.ts` does.
- Team member names are foreign keys: `Lou Rolwes`, `Dan Huber`, `Mike Smith`.
- Find an org by name with `where lower(name) like '%...%'`; ids are slugs and not guessable.

## Code conventions

- Next.js 15: `cookies()`, `params` and `searchParams` are promises; await them.
- All reads and writes run as the signed-in user through `src/lib/supabase/server.ts`, so row-level security applies. There is no service-role key in the app; keep it that way.
- Mutations are server actions in `src/app/actions.ts`, each ending in `revalidatePath`.
- Dropdown values live in `src/lib/constants.ts`; the database `status` and `kind` check constraints must match them.
- Dates are calendar dates in America/Chicago (`todayCentral()`).
