-- OurDay · Migration 3/3 · Row Level Security and privileges
-- Clients can READ their own workspace data and UPDATE their own display name. Nothing else is writable
-- directly; invitations are not readable at all. Everything else goes through the functions in migration 2.

alter table public.profiles              enable row level security;
alter table public.workspaces            enable row level security;
alter table public.workspace_members     enable row level security;
alter table public.workspace_invitations enable row level security;

-- ---- Table privileges: start from nothing, then grant the minimum. -------------------------------
revoke all on table public.profiles, public.workspaces, public.workspace_members, public.workspace_invitations
  from public, anon, authenticated;

grant select on public.profiles          to authenticated;
grant select on public.workspaces        to authenticated;
grant select on public.workspace_members to authenticated;
grant update (name) on public.profiles   to authenticated;   -- display name only
-- workspace_invitations: no client privileges at all.

-- ---- Policies ------------------------------------------------------------------------------------
-- profiles: your own row, plus the other member of your workspace.
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.shares_workspace_with(id));

-- profiles: you can update only your own row (and only the name column, per the grant above).
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- workspaces: members can read their workspace.
create policy workspaces_select on public.workspaces
  for select to authenticated
  using (id = public.current_workspace_id());

-- workspace_members: members can read the membership of their own workspace.
create policy workspace_members_select on public.workspace_members
  for select to authenticated
  using (workspace_id = public.current_workspace_id());

-- workspace_invitations: RLS is on and there are deliberately NO policies = no client access.

-- ---- Function privileges: signed-in users only (never anon / public). -----------------------------
revoke all on function public.set_updated_at()             from public, anon, authenticated;
revoke all on function public.handle_new_user()            from public, anon, authenticated;
revoke all on function public.enforce_member_limit()       from public, anon, authenticated;

revoke all on function public.current_workspace_id()       from public, anon, authenticated;
revoke all on function public.shares_workspace_with(uuid)  from public, anon, authenticated;
revoke all on function public.create_workspace(text)      from public, anon, authenticated;
revoke all on function public.create_invitation()          from public, anon, authenticated;
revoke all on function public.revoke_invitation()          from public, anon, authenticated;
revoke all on function public.get_invitation_status()      from public, anon, authenticated;
revoke all on function public.accept_invitation(text)      from public, anon, authenticated;

grant execute on function public.current_workspace_id()      to authenticated;
grant execute on function public.shares_workspace_with(uuid) to authenticated;
grant execute on function public.create_workspace(text)     to authenticated;
grant execute on function public.create_invitation()         to authenticated;
grant execute on function public.revoke_invitation()         to authenticated;
grant execute on function public.get_invitation_status()     to authenticated;
grant execute on function public.accept_invitation(text)     to authenticated;
