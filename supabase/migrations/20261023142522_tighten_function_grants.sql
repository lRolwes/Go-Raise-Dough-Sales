alter function public.touch_updated_at() set search_path = public;
revoke execute on function public.allowlist_signup() from public, anon, authenticated;
revoke execute on function public.current_member() from public, anon;
revoke execute on function public.is_team_member() from public, anon;
