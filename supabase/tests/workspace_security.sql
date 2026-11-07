-- OurDay · SQL security tests for the auth/workspace milestone.
--
-- HOW TO RUN: paste this whole file into the Supabase SQL Editor (or run with psql) AFTER applying the three
-- migrations. It creates throw-away test accounts, impersonates them with `set local role`, prints one row per
-- check (PASS/FAIL) and ROLLS EVERYTHING BACK, so nothing is left behind. It never touches real data.
--
-- NOT COVERED HERE (needs two real sessions): two people accepting the same code at the same instant. The
-- database protects this with row locks (workspace, then invitation) plus the member-limit trigger and unique
-- constraints; see supabase/README.md for a two-tab manual check.

begin;

create temp table test_results (n serial, name text, passed boolean, detail text);

create function pg_temp.as_user(u uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $f$;

create function pg_temp.as_anon() returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
end $f$;

create function pg_temp.as_admin() returns void language plpgsql as $f$
begin
  reset role;
end $f$;

-- Runs a statement; returns 'ok' or the error message. Does not abort the test.
create function pg_temp.try(q text) returns text language plpgsql as $f$
begin
  execute q;
  return 'ok';
exception when others then
  return sqlerrm;
end $f$;

-- Runs a statement returning one value and returns it as text.
create function pg_temp.val(q text) returns text language plpgsql as $f$
declare v text;
begin
  execute q into v;
  return v;
end $f$;

create function pg_temp.rec(t text, passed boolean, detail text default null) returns void language plpgsql security definer as $f$
begin
  insert into test_results (name, passed, detail) values (t, coalesce(passed, false), detail);
end $f$;

do $$
declare
  a uuid := gen_random_uuid();  -- first user (owner of workspace 1)
  b uuid := gen_random_uuid();  -- second user (joins workspace 1)
  c uuid := gen_random_uuid();  -- third person (must be refused by workspace 1; owner of workspace 2)
  d uuid := gen_random_uuid();  -- fourth person (joins workspace 2)
  w1 uuid; w2 uuid;
  code1 text; code2 text; code3 text; code4 text;
  m text; v text;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (a, 'a@test.local', '{"name":"Alice"}'),
    (b, 'b@test.local', '{"name":"Bob"}'),
    (c, 'c@test.local', '{}'),
    (d, 'd@test.local', '{"name":"Dan"}');

  -- Profiles are created automatically
  perform pg_temp.rec('profile created from sign-up name', (select name from public.profiles where id = a) = 'Alice');
  perform pg_temp.rec('profile name falls back to email local part', (select name from public.profiles where id = c) = 'c');

  -- Anonymous visitors get nothing
  perform pg_temp.as_anon();
  m := pg_temp.try('select * from public.profiles');
  perform pg_temp.as_admin();
  perform pg_temp.rec('anon cannot read profiles', m <> 'ok', m);
  perform pg_temp.as_anon();
  m := pg_temp.try('select public.create_workspace(''x'')');
  perform pg_temp.as_admin();
  perform pg_temp.rec('anon cannot call create_workspace', m <> 'ok', m);
  perform pg_temp.as_anon();
  m := pg_temp.try('select public.accept_invitation(''0123456789abcdef0123456789abcdef'')');
  perform pg_temp.as_admin();
  perform pg_temp.rec('anon cannot call accept_invitation', m <> 'ok', m);

  -- A creates the workspace
  perform pg_temp.as_user(a);
  w1 := pg_temp.val('select public.create_workspace(''Ours'')')::uuid;
  m := pg_temp.try('select public.create_workspace(''Again'')');
  perform pg_temp.as_admin();
  perform pg_temp.rec('first user creates workspace and becomes owner', (select role from public.workspace_members where workspace_id = w1 and user_id = a) = 'owner');
  perform pg_temp.rec('user cannot create a second workspace', m = 'already_in_workspace', m);

  -- Outsiders see nothing of workspace 1
  perform pg_temp.as_user(c);
  perform pg_temp.rec('outsider cannot read workspaces', pg_temp.val('select count(*) from public.workspaces') = '0');
  perform pg_temp.rec('outsider cannot read members', pg_temp.val('select count(*) from public.workspace_members') = '0');
  perform pg_temp.rec('outsider sees only own profile', pg_temp.val('select count(*) from public.profiles') = '1');
  m := pg_temp.try('select public.create_invitation()');
  perform pg_temp.as_admin();
  perform pg_temp.rec('non-owner cannot create invitation', m = 'not_owner', m);

  -- Invitation: raw code is never stored, clients cannot read the table
  perform pg_temp.as_user(a);
  code1 := pg_temp.val('select public.create_invitation() ->> ''code''');
  perform pg_temp.as_admin();
  perform pg_temp.rec('invitation code is long and random', char_length(code1) = 32 and code1 ~ '^[A-Za-z0-9_-]+$', 'len=' || char_length(code1));
  perform pg_temp.rec('only the hash is stored (raw code absent)',
    (select count(*) from public.workspace_invitations where code_hash = code1) = 0
    and (select count(*) from public.workspace_invitations where code_hash = encode(extensions.digest(code1, 'sha256'), 'hex')) = 1);
  perform pg_temp.as_user(a);
  m := pg_temp.try('select * from public.workspace_invitations');
  perform pg_temp.as_admin();
  perform pg_temp.rec('owner cannot read invitations table', m <> 'ok', m);
  perform pg_temp.as_user(a);
  m := pg_temp.try('insert into public.workspace_invitations (workspace_id, created_by, code_hash) values (''' || w1 || ''', ''' || a || ''', ''forged'')');
  perform pg_temp.as_admin();
  perform pg_temp.rec('owner cannot insert invitations directly', m <> 'ok', m);

  -- No direct membership / workspace tampering
  perform pg_temp.as_user(a);
  m := pg_temp.try('insert into public.workspace_members (workspace_id, user_id, role) values (''' || w1 || ''', ''' || c || ''', ''partner'')');
  perform pg_temp.rec('cannot insert members directly', m <> 'ok', m);
  m := pg_temp.try('update public.workspace_members set role = ''partner'' where user_id = ''' || a || '''');
  perform pg_temp.rec('cannot change own role', m <> 'ok', m);
  m := pg_temp.try('delete from public.workspace_members where user_id = ''' || a || '''');
  perform pg_temp.rec('cannot delete membership directly', m <> 'ok', m);
  m := pg_temp.try('update public.workspaces set name = ''hacked'' where id = ''' || w1 || '''');
  perform pg_temp.rec('cannot update workspace directly', m <> 'ok', m);
  m := pg_temp.try('update public.profiles set created_at = now() where id = ''' || a || '''');
  perform pg_temp.rec('cannot update profile columns other than name', m <> 'ok', m);
  perform pg_temp.rec('can update own display name', pg_temp.val('with u as (update public.profiles set name = ''Alice B'' where id = ''' || a || ''' returning 1) select count(*) from u') = '1');
  perform pg_temp.rec('cannot update another user''s name (0 rows)', pg_temp.val('with u as (update public.profiles set name = ''X'' where id = ''' || b || ''' returning 1) select count(*) from u') = '0');
  perform pg_temp.as_admin();

  -- Joining: wrong code, then the right one
  perform pg_temp.as_user(b);
  m := pg_temp.try('select public.accept_invitation(''this-is-not-a-real-code-0000000000'')');
  perform pg_temp.as_admin();
  perform pg_temp.rec('invalid code rejected', m = 'invalid_invitation', m);

  perform pg_temp.as_user(a);
  m := pg_temp.try('select public.accept_invitation(''' || code1 || ''')');
  perform pg_temp.as_admin();
  perform pg_temp.rec('owner cannot accept their own invitation', m = 'already_in_workspace', m);

  perform pg_temp.as_user(b);
  m := pg_temp.try('select public.accept_invitation(''' || code1 || ''')');
  perform pg_temp.as_admin();
  perform pg_temp.rec('second user joins with the code', m = 'ok', m);
  perform pg_temp.rec('workspace now has exactly two members', (select count(*) from public.workspace_members where workspace_id = w1) = 2);
  perform pg_temp.rec('joiner has the partner role', (select role from public.workspace_members where user_id = b) = 'partner');

  -- Both members see the same workspace and each other's profile; outsiders still see nothing
  perform pg_temp.as_user(b);
  perform pg_temp.rec('member B sees the workspace', pg_temp.val('select count(*) from public.workspaces where id = ''' || w1 || '''') = '1');
  perform pg_temp.rec('member B sees both members', pg_temp.val('select count(*) from public.workspace_members') = '2');
  perform pg_temp.rec('member B sees both profiles', pg_temp.val('select count(*) from public.profiles') = '2');
  perform pg_temp.as_user(a);
  perform pg_temp.rec('member A sees both profiles', pg_temp.val('select count(*) from public.profiles') = '2');
  perform pg_temp.as_user(c);
  perform pg_temp.rec('outsider still sees only own profile', pg_temp.val('select count(*) from public.profiles') = '1');
  perform pg_temp.rec('outsider still sees no workspaces', pg_temp.val('select count(*) from public.workspaces') = '0');
  perform pg_temp.as_admin();

  -- Single use, no third member
  perform pg_temp.as_user(c);
  m := pg_temp.try('select public.accept_invitation(''' || code1 || ''')');
  perform pg_temp.as_admin();
  perform pg_temp.rec('used invitation cannot be reused', m = 'invitation_used', m);

  perform pg_temp.as_user(a);
  m := pg_temp.try('select public.create_invitation()');
  perform pg_temp.as_admin();
  perform pg_temp.rec('full workspace cannot issue invitations', m = 'workspace_full', m);

  perform pg_temp.as_user(b);
  m := pg_temp.try('select public.create_invitation()');
  perform pg_temp.as_admin();
  perform pg_temp.rec('partner cannot create invitations', m = 'not_owner', m);

  -- A live invitation on a full workspace is still refused (accept path)
  insert into public.workspace_invitations (workspace_id, created_by, code_hash)
    values (w1, a, encode(extensions.digest('FULL-WORKSPACE-CODE-000000000000000', 'sha256'), 'hex'));
  perform pg_temp.as_user(c);
  m := pg_temp.try('select public.accept_invitation(''FULL-WORKSPACE-CODE-000000000000000'')');
  perform pg_temp.as_admin();
  perform pg_temp.rec('third person cannot join a full workspace', m = 'workspace_full', m);

  -- Database backstops, independent of the functions
  m := pg_temp.try('insert into public.workspace_members (workspace_id, user_id, role) values (''' || w1 || ''', ''' || c || ''', ''partner'')');
  perform pg_temp.rec('trigger blocks a third member even for a privileged insert', m = 'workspace_full', m);
  m := pg_temp.try('insert into public.workspace_members (workspace_id, user_id, role) values (''' || w1 || ''', ''' || a || ''', ''partner'')');
  perform pg_temp.rec('a duplicate membership is rejected', m <> 'ok', m);

  -- Second workspace: expiry, revoke, regenerate
  perform pg_temp.as_user(c);
  w2 := pg_temp.val('select public.create_workspace(''Other'')')::uuid;
  code2 := pg_temp.val('select public.create_invitation() ->> ''code''');
  perform pg_temp.as_admin();
  update public.workspace_invitations set expires_at = now() - interval '1 minute' where workspace_id = w2;
  perform pg_temp.as_user(d);
  m := pg_temp.try('select public.accept_invitation(''' || code2 || ''')');
  perform pg_temp.as_admin();
  perform pg_temp.rec('expired invitation rejected', m = 'invitation_expired', m);

  perform pg_temp.as_user(c);
  code3 := pg_temp.val('select public.create_invitation() ->> ''code''');
  perform pg_temp.as_admin();
  perform pg_temp.rec('regenerating leaves only one live invitation', (select count(*) from public.workspace_invitations where workspace_id = w2 and accepted_at is null and revoked_at is null) = 1);
  perform pg_temp.as_user(d);
  m := pg_temp.try('select public.accept_invitation(''' || code2 || ''')');
  perform pg_temp.as_admin();
  perform pg_temp.rec('old code stops working after regeneration', m = 'invalid_invitation', m);

  perform pg_temp.as_user(c);
  perform pg_temp.rec('owner can see invitation status', pg_temp.val('select public.get_invitation_status() ->> ''has_active''') = 'true');
  perform pg_temp.try('select public.revoke_invitation()');
  perform pg_temp.rec('revoked invitation shows as inactive', pg_temp.val('select public.get_invitation_status() ->> ''has_active''') = 'false');
  perform pg_temp.as_user(d);
  m := pg_temp.try('select public.accept_invitation(''' || code3 || ''')');
  perform pg_temp.as_admin();
  perform pg_temp.rec('revoked invitation rejected', m = 'invalid_invitation', m);

  perform pg_temp.as_user(c);
  code4 := pg_temp.val('select public.create_invitation() ->> ''code''');
  perform pg_temp.as_user(d);
  m := pg_temp.try('select public.accept_invitation(''' || code4 || ''')');
  perform pg_temp.as_admin();
  perform pg_temp.rec('fresh invitation works after revoke', m = 'ok', m);
  perform pg_temp.rec('user already in a workspace cannot join another', (select count(*) from public.workspace_members where user_id = d) = 1);

  -- A user in one workspace cannot be pulled into another
  perform pg_temp.as_user(b);
  m := pg_temp.try('select public.accept_invitation(''' || code4 || ''')');
  perform pg_temp.as_admin();
  perform pg_temp.rec('member of workspace 1 cannot join workspace 2', m in ('already_in_workspace', 'invitation_used'), m);

  -- Cross-workspace isolation
  perform pg_temp.as_user(a);
  perform pg_temp.rec('workspace 1 member cannot see workspace 2', pg_temp.val('select count(*) from public.workspaces where id = ''' || w2 || '''') = '0');
  perform pg_temp.as_admin();
end $$;

select n, case when passed then 'PASS' else 'FAIL' end as result, name, detail from test_results order by n;
select count(*) filter (where passed) as passed, count(*) filter (where not passed) as failed, count(*) as total from test_results;

rollback;
