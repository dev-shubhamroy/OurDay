-- OurDay · Migration 2/3 · Helper and workspace functions
-- All workspace changes go through these SECURITY DEFINER functions; clients never write the tables directly.
-- Every function pins search_path, requires a signed-in user, and raises short machine-readable error codes
-- (no sensitive detail): not_authenticated, already_in_workspace, not_owner, invalid_invitation,
-- invitation_expired, invitation_used, own_invitation, workspace_full, invalid_name.

-- The workspace the current user belongs to (users have at most one).
create or replace function public.current_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.workspace_id from public.workspace_members m where m.user_id = (select auth.uid()) limit 1
$$;

-- True when the given user is in the same workspace as the current user (used for profile visibility).
create or replace function public.shares_workspace_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members a
    join public.workspace_members b on b.workspace_id = a.workspace_id
    where a.user_id = (select auth.uid()) and b.user_id = p_user
  )
$$;

-- First user creates the workspace and becomes its owner.
create or replace function public.create_workspace(p_name text default 'Our workspace')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  n text := btrim(coalesce(p_name, ''));
  ws uuid;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if n = '' then n := 'Our workspace'; end if;
  if char_length(n) > 60 then raise exception 'invalid_name' using errcode = 'P0001'; end if;
  if exists (select 1 from public.workspace_members where user_id = uid) then
    raise exception 'already_in_workspace' using errcode = 'P0001';
  end if;

  insert into public.workspaces (name, created_by) values (n, uid) returning id into ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws, uid, 'owner');
  return ws;
end;
$$;

-- Owner generates a fresh invitation; any previous live one is revoked.
-- Returns the raw code ONCE. Only its SHA-256 hash is stored, so it cannot be shown again.
create or replace function public.create_invitation()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  ws uuid;
  code text;
  exp timestamptz;
  members int;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  select workspace_id into ws from public.workspace_members where user_id = uid and role = 'owner';
  if ws is null then raise exception 'not_owner' using errcode = 'P0001'; end if;

  -- Lock order everywhere: workspace row first, then invitation rows (prevents deadlocks).
  perform 1 from public.workspaces where id = ws for update;
  select count(*) into members from public.workspace_members where workspace_id = ws;
  if members >= 2 then raise exception 'workspace_full' using errcode = 'P0001'; end if;

  update public.workspace_invitations
     set revoked_at = now()
   where workspace_id = ws and accepted_at is null and revoked_at is null;

  -- 24 random bytes (192 bits) -> 32 URL-safe characters.
  code := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
  exp := now() + interval '7 days';
  insert into public.workspace_invitations (workspace_id, created_by, code_hash, expires_at)
  values (ws, uid, encode(extensions.digest(code, 'sha256'), 'hex'), exp);

  return jsonb_build_object('code', code, 'expires_at', exp);
end;
$$;

-- Owner revokes the live invitation (if any).
create or replace function public.revoke_invitation()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  ws uuid;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  select workspace_id into ws from public.workspace_members where user_id = uid and role = 'owner';
  if ws is null then raise exception 'not_owner' using errcode = 'P0001'; end if;
  perform 1 from public.workspaces where id = ws for update;
  update public.workspace_invitations
     set revoked_at = now()
   where workspace_id = ws and accepted_at is null and revoked_at is null;
end;
$$;

-- Owner can see whether an invitation is live (the code itself is never retrievable).
create or replace function public.get_invitation_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  ws uuid;
  exp timestamptz;
  members int;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  select workspace_id into ws from public.workspace_members where user_id = uid and role = 'owner';
  if ws is null then raise exception 'not_owner' using errcode = 'P0001'; end if;
  select count(*) into members from public.workspace_members where workspace_id = ws;
  select expires_at into exp
    from public.workspace_invitations
   where workspace_id = ws and accepted_at is null and revoked_at is null and expires_at > now()
   limit 1;
  return jsonb_build_object('has_active', exp is not null, 'expires_at', exp, 'member_count', members);
end;
$$;

-- Second user joins with the invitation code. One transaction; safe against concurrent attempts.
create or replace function public.accept_invitation(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  h text;
  ws uuid;
  inv public.workspace_invitations%rowtype;
  members int;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if p_code is null or char_length(btrim(p_code)) < 16 or char_length(p_code) > 128 then
    raise exception 'invalid_invitation' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.workspace_members where user_id = uid) then
    raise exception 'already_in_workspace' using errcode = 'P0001';
  end if;

  h := encode(extensions.digest(btrim(p_code), 'sha256'), 'hex');

  -- Find the workspace without locking, then lock in the global order: workspace, then invitation.
  select workspace_id into ws from public.workspace_invitations where code_hash = h;
  if ws is null then raise exception 'invalid_invitation' using errcode = 'P0001'; end if;
  perform 1 from public.workspaces where id = ws for update;

  select * into inv from public.workspace_invitations where code_hash = h for update;
  if not found or inv.revoked_at is not null then raise exception 'invalid_invitation' using errcode = 'P0001'; end if;
  if inv.accepted_at is not null then raise exception 'invitation_used' using errcode = 'P0001'; end if;
  if inv.expires_at <= now() then raise exception 'invitation_expired' using errcode = 'P0001'; end if;
  if inv.created_by = uid then raise exception 'own_invitation' using errcode = 'P0001'; end if;

  select count(*) into members from public.workspace_members where workspace_id = ws;
  if members >= 2 then raise exception 'workspace_full' using errcode = 'P0001'; end if;

  insert into public.workspace_members (workspace_id, user_id, role) values (ws, uid, 'partner');
  update public.workspace_invitations set accepted_by = uid, accepted_at = now() where id = inv.id;
  return ws;
end;
$$;
