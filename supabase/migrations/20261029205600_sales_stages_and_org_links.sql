-- Sales stages from Mike's example, slotted between Replied and Customer.
-- Customer is the "Closed Won" stage and Not interested is "Closed Lost".
alter table public.orgs drop constraint orgs_status_check;
alter table public.orgs add constraint orgs_status_check check (status in (
  'Not contacted','Draft ready','Sent','Replied',
  'Qualification & Discovery','Meeting set','Demo / Presentation','Proposal / Quote','Negotiation',
  'Customer','Not interested','Bounced'));

-- Related prospects, e.g. a K of C council and its parish. One row per pair; it shows on both prospects.
create table public.org_links (
  id         uuid primary key default gen_random_uuid(),
  org_id     text not null references public.orgs(id) on delete cascade,
  related_id text not null references public.orgs(id) on delete cascade,
  relation   text,                         -- how they're connected, in plain words
  created_by text references public.team_members(name) on update cascade,
  created_at timestamptz not null default now(),
  check (org_id <> related_id)
);
create unique index org_links_pair_idx on public.org_links (least(org_id, related_id), greatest(org_id, related_id));
create index org_links_related_idx on public.org_links(related_id);

alter table public.org_links enable row level security;
create policy links_all on public.org_links for all to authenticated using (public.is_team_member()) with check (public.is_team_member());
