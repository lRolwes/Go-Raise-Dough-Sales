# GRD Sales

The Go Raise Dough sales CRM: every prospect organization, who owns it, what has been said to it, and what is due next. Only the sales team can sign in.

## What it does

- **Dashboard** (the home page): prospect counts by status, follow-ups due, the last 7 days of emails, replies and calls compared with the week before, a per-person status table, breakdowns by org type, fundraising, state and contact type, warm leads, and recent replies and calls. Switch between everyone, one person, or unassigned prospects. The status, follow-up and breakdown numbers link to the matching list. The counts come from the `dashboard_stats()` database function.
- **Follow-ups**: every open follow-up, filtered by when it is due (overdue, today, this week), by who owns it, and by the prospect's status, org type and fundraising. Mark one done or push it a week from the list.
- **Drafts**: cold emails Claude has written, for the sender to review before they go out. Opens on your own drafts that haven't been sent; switch to another person or everyone, and filter by status, send day (Central time), group, state, or a search of org, town, subject and email. Each card has the recipient, send time and Claude's research note; edit the subject, email and notes in place (they save as you type), undo your edits, and mark it OK to send, Needs changes or Skip. Sent and bounced drafts are read-only. The nav badge counts your drafts still To review.
- **Prospects**: the full list, filtered by status, assignee (including unassigned), org type, state, fundraising, game status, contact type and fit, plus a name search.
- **Prospect page**: log a call, email or note (and optionally change the status and schedule the next follow-up in the same step), the full history, contacts, what the org runs, research evidence and sources, the email draft, and an editable details form.
- **Add prospect**: a new organization with its main contact.

## Running it

| | |
|---|---|
| Hosting | Vercel, deployed from `main` on GitHub |
| Database and logins | Supabase project `grd-sales-crm` (ref `fospkpvttcdtulttcqjl`) |
| App | Next.js 15 (App Router), server components and server actions, `@supabase/ssr` |

Vercel needs two environment variables, the same values as `.env.example`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the project's publishable key; it is safe in the browser because row-level security does the gating)

Local development: copy `.env.example` to `.env.local`, then `npm install` and `npm run dev`.

## Who can sign in

Accounts are limited to the `team_members` table. Sign-up refuses any email that is not on it, and confirms the ones that are, so there is no confirmation email to wait for. To add someone:

```sql
insert into team_members (name, email) values ('New Person', 'person@example.com');
```

They can then create their password at `/signup`. Set `active = false` to lock someone out without deleting their history.

## Data model

See `supabase/migrations/` for the full schema.

- `orgs`: one row per prospect organization. `id` is a stable text slug. `status` is one of Not contacted, Draft ready, Sent, Replied, Meeting set, Not interested, Customer, Bounced. `assignee` is a team member name or null (unassigned).
- `contacts`: people, emails and phones per org.
- `activities`: the history log (Email sent, Email received, Call, Voicemail, Meeting, Note, Bounce, Status change).
- `follow_ups`: scheduled next steps. Open ones have `done_at is null`.
- `drafts`: one row per email Claude has drafted. `assignee` is the sender, whose review queue it is. `subject` and `body` are what will be sent; `original_subject` and `original_body` are what Claude wrote, so the reviewer can undo. `status` is To review, OK to send, Needs changes or Skip (set by the reviewer, who is recorded in `reviewed_by` and `reviewed_at`), then Sent or Bounced once it goes out. `note` is the reviewer's notes to Claude; `scheduled_for` is when it should go out. The page can change only the subject, body, note and review status, and nothing once a draft is Sent or Bounced.
- Views: `open_follow_ups` (open follow-ups with their org's fields) and `org_next_follow_up` (the earliest open follow-up per org).

Every table has row-level security: only a signed-in, active team member can read or write.
