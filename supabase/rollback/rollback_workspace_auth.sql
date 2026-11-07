-- OurDay · Rollback for migrations 20261108100000..20261108100200.
-- DESTRUCTIVE: drops the workspace tables and all data in them (profiles, workspaces, members, invitations).
-- Only run this if you really want to undo the milestone. It never touches auth.users.
drop trigger if exists on_auth_user_created on auth.users;
drop table if exists public.workspace_invitations;
drop table if exists public.workspace_members;
drop table if exists public.workspaces;
drop table if exists public.profiles;
drop function if exists public.accept_invitation(text);
drop function if exists public.get_invitation_status();
drop function if exists public.revoke_invitation();
drop function if exists public.create_invitation();
drop function if exists public.create_workspace(text);
drop function if exists public.shares_workspace_with(uuid);
drop function if exists public.current_workspace_id();
drop function if exists public.enforce_member_limit();
drop function if exists public.handle_new_user();
drop function if exists public.set_updated_at();
