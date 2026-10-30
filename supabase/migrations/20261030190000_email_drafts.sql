-- Email drafts a team member reviews in the app before Claude sends them (Mike's first batches: Nov 4-6 2026).
create table public.drafts (
  id               uuid primary key default gen_random_uuid(),
  org_id           text not null references public.orgs(id) on update cascade on delete cascade,
  assignee         text not null references public.team_members(name) on update cascade,  -- the sender, whose review queue it is
  kind             text not null default 'Intro' check (kind in ('Intro','Follow-up')),
  batch            text,            -- e.g. 'Mike, Wed Nov 4'
  seq              int,             -- card number within the batch
  group_label      text,            -- 'Schools and ministries', 'Posts, lodges and clubs', ...
  to_email         text not null,
  to_name          text,
  subject          text not null,
  body             text not null,
  original_subject text not null,   -- as drafted; lets the reviewer undo their edits
  original_body    text not null,
  research_note    text,            -- why this org and where the opener came from
  note             text,            -- the reviewer's notes to Claude
  status           text not null default 'To review'
                     check (status in ('To review','OK to send','Needs changes','Skip','Sent','Bounced')),
  scheduled_for    timestamptz,
  reviewed_by      text references public.team_members(name) on update cascade,
  reviewed_at      timestamptz,
  sent_at          timestamptz,
  message_id       text,
  thread_url       text,
  created_by       text references public.team_members(name) on update cascade,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index drafts_queue_idx on public.drafts (assignee, scheduled_for, seq);
create index drafts_org_idx on public.drafts (org_id);
create index drafts_status_idx on public.drafts (status);
create trigger drafts_touch before update on public.drafts for each row execute function public.touch_updated_at();

alter table public.drafts enable row level security;
create policy drafts_all on public.drafts for all to authenticated
  using (public.is_team_member()) with check (public.is_team_member());
