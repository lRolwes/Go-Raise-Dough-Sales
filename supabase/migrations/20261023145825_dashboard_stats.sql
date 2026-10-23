-- Everything the dashboard counts, in one call. Runs as the signed-in user, so row-level security applies.
-- p_who: null = everyone, 'unassigned' = no assignee, otherwise a team member name.
create or replace function public.dashboard_stats(p_who text default null, p_today date default current_date)
returns jsonb language sql stable security invoker set search_path = public as $$
  with o as (
    select * from public.orgs
    where p_who is null or (p_who = 'unassigned' and assignee is null) or assignee = p_who
  )
  select jsonb_build_object(
    -- org counts grouped by every dimension the dashboard breaks down by
    'orgs', (select coalesce(jsonb_agg(c), '[]'::jsonb) from (
      select status, assignee, category, state, fundraising, contact_type, count(*)::int as n
      from o group by 1, 2, 3, 4, 5, 6) c),
    -- open follow-ups per assignee
    'follow_ups', (select coalesce(jsonb_agg(c), '[]'::jsonb) from (
      select assignee,
             count(*) filter (where due_on < p_today)::int as overdue,
             count(*) filter (where due_on = p_today)::int as today,
             count(*) filter (where due_on > p_today and due_on <= p_today + 7)::int as week,
             count(*)::int as open
      from public.follow_ups
      where done_at is null and (p_who is null or (p_who = 'unassigned' and assignee is null) or assignee = p_who)
      group by 1) c),
    -- activity per day and kind on these prospects, last 30 days
    'activity', (select coalesce(jsonb_agg(c), '[]'::jsonb) from (
      select a.occurred_on as day, a.kind, count(*)::int as n
      from public.activities a join o on o.id = a.org_id
      where a.occurred_on > p_today - 30 and a.occurred_on <= p_today
      group by 1, 2) c)
  )
$$;
revoke execute on function public.dashboard_stats(text, date) from public, anon;
grant execute on function public.dashboard_stats(text, date) to authenticated;
