-- OurDay · Partner invitation flow repair (additive: replaces one function, adds three).
--
-- WHY: a second person who signed up from an invitation could end up in their OWN, empty workspace (the first-run screen
-- offers "Create our workspace" first and the invitation was lost during sign-in). Once that happened, accept_invitation
-- refused them forever ('already_in_workspace') and the link looked like it "just opens the app". Production showed exactly
-- that: two users, two single-member workspaces, three invitations, none accepted.
--
-- WHAT: (1) invitation_preview(code): who is inviting, and what would happen for the person looking at the link, so the
-- app can show a confirmation screen BEFORE anything changes (callable before sign-in; it reveals only the inviter's first
-- name and workspace name to someone who already holds the secret code).
-- (2) accept_invitation(code): unchanged rules (single use, expiry, revocation, two-member limit, no self-invite), plus one
-- safe case: someone who is alone in a workspace that has NO tasks and NO habits may join; that empty workspace is removed
-- in the same transaction. Anyone whose workspace holds data, or who shares it with another person, is still refused,
-- so nothing a person created is ever discarded.

-- The caller's workspace if (and only if) they are its only member and it is empty.
create or replace function public.solo_empty_workspace(p_user uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select m.workspace_id
    from public.workspace_members m
   where m.user_id = p_user
     and (select count(*) from public.workspace_members x where x.workspace_id = m.workspace_id) = 1
     and not exists (select 1 from public.tasks t where t.workspace_id = m.workspace_id)
     and not exists (select 1 from public.habits h where h.workspace_id = m.workspace_id)
$$;
revoke all on function public.solo_empty_workspace(uuid) from public, anon, authenticated;

create or replace function public.invitation_preview(p_code text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  h text; inv public.workspace_invitations%rowtype; members int; st text; caller text; cur uuid;
begin
  if p_code is null or char_length(btrim(p_code)) < 16 or char_length(p_code) > 128 then
    return jsonb_build_object('status', 'invalid');
  end if;
  h := encode(extensions.digest(btrim(p_code), 'sha256'), 'hex');
  select * into inv from public.workspace_invitations where code_hash = h;
  if not found then return jsonb_build_object('status', 'invalid'); end if;

  select count(*) into members from public.workspace_members where workspace_id = inv.workspace_id;
  st := case when inv.revoked_at is not null then 'revoked'
             when inv.accepted_at is not null then 'used'
             when inv.expires_at <= now() then 'expired'
             when members >= 2 then 'full'
             else 'valid' end;

  if uid is null then caller := 'anonymous';
  elsif uid = inv.created_by then caller := 'inviter';
  elsif exists (select 1 from public.workspace_members where workspace_id = inv.workspace_id and user_id = uid) then caller := 'member';
  else
    select workspace_id into cur from public.workspace_members where user_id = uid;
    caller := case when cur is null then 'free'
                   when public.solo_empty_workspace(uid) = cur then 'replaceable'
                   else 'blocked' end;
  end if;

  return jsonb_build_object(
    'status', st,
    'caller', caller,
    'inviter_name', coalesce(nullif(split_part((select name from public.profiles where id = inv.created_by), ' ', 1), ''), 'Your partner'),
    'workspace_name', (select name from public.workspaces where id = inv.workspace_id),
    'expires_at', inv.expires_at);
end $$;
revoke all on function public.invitation_preview(text) from public;
grant execute on function public.invitation_preview(text) to anon, authenticated;

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
  cur uuid;
  inv public.workspace_invitations%rowtype;
  members int;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if p_code is null or char_length(btrim(p_code)) < 16 or char_length(p_code) > 128 then
    raise exception 'invalid_invitation' using errcode = 'P0001';
  end if;
  h := encode(extensions.digest(btrim(p_code), 'sha256'), 'hex');

  select workspace_id into ws from public.workspace_invitations where code_hash = h;
  if ws is null then raise exception 'invalid_invitation' using errcode = 'P0001'; end if;
  select workspace_id into cur from public.workspace_members where user_id = uid;
  if cur = ws then raise exception 'already_in_workspace' using errcode = 'P0001'; end if;

  -- Lock in one global order (by id) so two people accepting each other's invitations can never deadlock.
  perform 1 from public.workspaces where id in (ws, coalesce(cur, ws)) order by id for update;

  select * into inv from public.workspace_invitations where code_hash = h for update;
  if not found or inv.revoked_at is not null then raise exception 'invalid_invitation' using errcode = 'P0001'; end if;
  if inv.accepted_at is not null then raise exception 'invitation_used' using errcode = 'P0001'; end if;
  if inv.expires_at <= now() then raise exception 'invitation_expired' using errcode = 'P0001'; end if;
  if inv.created_by = uid then raise exception 'own_invitation' using errcode = 'P0001'; end if;

  select count(*) into members from public.workspace_members where workspace_id = ws;
  if members >= 2 then raise exception 'workspace_full' using errcode = 'P0001'; end if;

  if cur is not null then
    -- Only an empty, single-person workspace may be replaced; anything else keeps its data and stays put.
    if public.solo_empty_workspace(uid) is distinct from cur then raise exception 'already_in_workspace' using errcode = 'P0001'; end if;
    delete from public.workspaces where id = cur;   -- cascades the (only) membership row of this person
  end if;

  insert into public.workspace_members (workspace_id, user_id, role) values (ws, uid, 'partner');
  update public.workspace_invitations set accepted_by = uid, accepted_at = now() where id = inv.id;
  return ws;
end;
$$;
