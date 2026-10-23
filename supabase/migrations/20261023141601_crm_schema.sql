-- Go Raise Dough sales CRM: team, prospects (orgs), contacts, activity log, follow-ups.
create extension if not exists pgcrypto;

create table public.team_members (
  name   text primary key,                 -- 'Lou Rolwes', 'Mike Smith', 'Dan Huber'
  email  text unique,                      -- login email; only these can sign up
  active boolean not null default true
);

create table public.orgs (
  id            text primary key,          -- stable slug (keeps the old tracker ids)
  name          text not null,
  category      text,                      -- Veterans, Fraternal, Catholic parish, Catholic school, School & boosters, Nonprofit, Community & festival, Other
  org_type      text,                      -- free-text type from research
  status        text not null default 'Not contacted'
                check (status in ('Not contacted','Draft ready','Sent','Replied','Meeting set','Not interested','Customer','Bounced')),
  assignee      text references public.team_members(name) on update cascade,  -- null = unassigned
  fundraising   text,                      -- Queen of Hearts, 50/50, Mega raffle, Bingo & gaming, Other raffles, Unknown
  game_status   text,                      -- Running now, Check status, Past game, Good fit, Start a game
  game_detail   text,                      -- schedule, ticket price, jackpot
  pitch         text,
  contact_type  text,                      -- Named contact, Generic inbox, Phone only, Inbound, No contact info
  fit           text,                      -- high, medium, low
  source_list   text,                      -- which research list / campaign it came from
  street        text, town text, county text, state text, region text, diocese text,
  website       text, facebook text,
  evidence      text,                      -- what the research found
  notes         text,
  sources       jsonb not null default '[]'::jsonb,
  draft_subject text, draft_body text,
  thread_url    text,
  first_contact date, last_contact date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.contacts (
  id         uuid primary key default gen_random_uuid(),
  org_id     text not null references public.orgs(id) on delete cascade,
  name       text, role text, email text, phone text,
  is_primary boolean not null default false,
  notes      text,
  created_at timestamptz not null default now()
);

create table public.activities (
  id          uuid primary key default gen_random_uuid(),
  org_id      text not null references public.orgs(id) on delete cascade,
  occurred_on date not null default current_date,
  kind        text not null default 'Note'
              check (kind in ('Email sent','Email received','Call','Voicemail','Meeting','Note','Bounce','Status change')),
  summary     text not null,
  by_member   text references public.team_members(name) on update cascade,
  thread_url  text,
  created_at  timestamptz not null default now()
);

create table public.follow_ups (
  id         uuid primary key default gen_random_uuid(),
  org_id     text not null references public.orgs(id) on delete cascade,
  due_on     date not null,
  task       text not null,
  assignee   text references public.team_members(name) on update cascade,
  done_at    timestamptz,
  done_by    text references public.team_members(name) on update cascade,
  created_by text references public.team_members(name) on update cascade,
  created_at timestamptz not null default now()
);

create index orgs_status_idx    on public.orgs(status);
create index orgs_assignee_idx  on public.orgs(assignee);
create index orgs_state_idx     on public.orgs(state);
create index orgs_category_idx  on public.orgs(category);
create index orgs_name_trgm_idx on public.orgs(lower(name));
create index contacts_org_idx   on public.contacts(org_id);
create index activities_org_idx on public.activities(org_id, occurred_on desc);
create index follow_ups_open_idx on public.follow_ups(due_on) where done_at is null;
create index follow_ups_org_idx on public.follow_ups(org_id);

-- keep orgs.updated_at current
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger orgs_touch before update on public.orgs for each row execute function public.touch_updated_at();

-- who is signed in, as a team member name
create or replace function public.current_member() returns text
language sql stable security definer set search_path = public as $$
  select name from public.team_members where active and lower(email) = lower(auth.jwt() ->> 'email')
$$;

create or replace function public.is_team_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members where active and lower(email) = lower(auth.jwt() ->> 'email'))
$$;

-- one view the follow-up screen reads: open follow-ups with their org
create view public.open_follow_ups with (security_invoker = true) as
  select f.*, o.name as org_name, o.status as org_status, o.category, o.fundraising, o.state, o.town,
         o.assignee as org_assignee
  from public.follow_ups f join public.orgs o on o.id = f.org_id
  where f.done_at is null;

-- next open follow-up per org, for the prospect list
create view public.org_next_follow_up with (security_invoker = true) as
  select distinct on (org_id) org_id, due_on, task, assignee
  from public.follow_ups where done_at is null order by org_id, due_on;

-- Row-level security: only signed-in team members can read or write anything.
alter table public.team_members enable row level security;
alter table public.orgs         enable row level security;
alter table public.contacts     enable row level security;
alter table public.activities   enable row level security;
alter table public.follow_ups   enable row level security;

create policy team_read   on public.team_members for select to authenticated using (public.is_team_member());
create policy orgs_all    on public.orgs        for all to authenticated using (public.is_team_member()) with check (public.is_team_member());
create policy contacts_all on public.contacts   for all to authenticated using (public.is_team_member()) with check (public.is_team_member());
create policy acts_all    on public.activities  for all to authenticated using (public.is_team_member()) with check (public.is_team_member());
create policy fups_all    on public.follow_ups  for all to authenticated using (public.is_team_member()) with check (public.is_team_member());

-- Sign-up allowlist: only team_members emails can create an account, and they are confirmed on creation.
create or replace function public.allowlist_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.team_members where active and lower(email) = lower(new.email)) then
    raise exception 'This email is not on the Go Raise Dough sales team list.';
  end if;
  new.email_confirmed_at := coalesce(new.email_confirmed_at, now());
  return new;
end $$;
create trigger allowlist_signup before insert on auth.users for each row execute function public.allowlist_signup();

insert into public.team_members (name, email) values
  ('Lou Rolwes', 'lou@ladsnet.com'),
  ('Dan Huber',  'danh@ladsnet.com'),
  ('Mike Smith', null);
