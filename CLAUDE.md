# GRD Sales CRM — notes for Claude

Read `README.md` first for what the app does and the data model.

## Updating records for Lou

Lou asks Claude to log calls, emails and follow-ups conversationally. Do it directly in the database with the Supabase MCP (`execute_sql`, project `fospkpvttcdtulttcqjl`), not through the app. Schema changes go through `apply_migration` and get a matching file in `supabase/migrations/`.

- Logging an email or call: insert into `activities` (`kind`, `summary`, `occurred_on`, `by_member`), set `orgs.last_contact`, and update `orgs.status` when it changes.
- Scheduling: insert into `follow_ups` (`due_on`, `task`, `assignee`, `created_by`). Completing: set `done_at = now()` and `done_by`.
- When a new contact is sent an email, close that org's open follow-ups and schedule the next one, the way `logActivity` in `src/app/actions.ts` does.
- Team member names are foreign keys: `Lou Rolwes`, `Dan Huber`, `Mike Smith`.
- Find an org by name with `where lower(name) like '%...%'`; ids are slugs and not guessable.

## Email drafts for review

Cold emails go into `drafts` first; the sender reviews them on the Drafts page, and Claude sends only what they approve.

- Loading: insert one row per email with `org_id`, `assignee` (the sender), `kind`, `batch` (e.g. `Mike, Wed Nov 4`), `seq`, `group_label`, `to_email`, `to_name`, `subject`, `body` (plain text, real line breaks), `research_note`, `scheduled_for` and `created_by`. Set `original_subject` and `original_body` to the same text as `subject` and `body`. Status starts at To review.
- Sending: send only `status = 'OK to send'`, using the row's current `subject` and `body` (the reviewer may have edited them); if its `note` asks for a change, ask before sending. Then set `status = 'Sent'`, `sent_at`, `message_id` and `thread_url`, and log it the way `logActivity` does: an `Email sent` activity by the sender with the `thread_url`, `orgs.last_contact`, `orgs.status = 'Sent'` if it was earlier in the pipeline, close the org's open follow-ups and schedule the next one.
- Needs changes: rewrite from the `note`, set `subject`, `body` and both `original_*` to the new text, and put it back to To review. Skip means don't send. A bounce sets `status = 'Bounced'` and gets a `Bounce` activity.

## Code conventions

- Next.js 15: `cookies()`, `params` and `searchParams` are promises; await them.
- All reads and writes run as the signed-in user through `src/lib/supabase/server.ts`, so row-level security applies. There is no service-role key in the app; keep it that way.
- Mutations are server actions in `src/app/actions.ts`, each ending in `revalidatePath`.
- Dropdown values live in `src/lib/constants.ts`; the database `status` and `kind` check constraints must match them.
- Dates are calendar dates in America/Chicago (`todayCentral()`).
