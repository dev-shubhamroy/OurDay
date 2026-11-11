-- OurDay · partner invitation flow (migration 11).
-- Run AFTER all four migrations, exactly like workspace_security.sql: paste into the Supabase SQL Editor.
-- Creates throw-away users, impersonates them, prints PASS/FAIL per check and ROLLS EVERYTHING BACK.

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
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); d uuid := gen_random_uuid(); e uuid := gen_random_uuid(); f uuid := gen_random_uuid(); g uuid := gen_random_uuid();
  wa uuid; wb uuid; wc uuid; wd uuid; wg uuid; code text; code2 text; m text; r jsonb; n int;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (a, 'a@inv.test', '{"name":"Alice Adams"}'), (b, 'b@inv.test', '{"name":"Bob Brown"}'), (c, 'c@inv.test', '{"name":"Cara"}'),
    (d, 'd@inv.test', '{"name":"Dan"}'), (e, 'e@inv.test', '{"name":"Eve"}'), (f, 'f@inv.test', '{"name":"Finn"}'), (g, 'g@inv.test', '{"name":"Gus"}');

  -- ===== creation =====
  perform pg_temp.as_user(a); wa := public.create_workspace('Alice and Bob');
  r := public.create_invitation();
  code := r ->> 'code';
  perform pg_temp.rec('the code is long and URL-safe (192 random bits)', char_length(code) = 32 and code ~ '^[A-Za-z0-9_-]+$');
  perform pg_temp.rec('the invitation expires in 7 days', (r ->> 'expires_at')::timestamptz between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour');
  perform pg_temp.as_admin();
  perform pg_temp.rec('only a hash is stored, never the code', not exists (select 1 from public.workspace_invitations where code_hash = code) and exists (select 1 from public.workspace_invitations where code_hash = encode(extensions.digest(code, 'sha256'), 'hex')));
  perform pg_temp.as_user(a);
  code2 := public.create_invitation() ->> 'code';
  perform pg_temp.as_admin();
  perform pg_temp.rec('only one invitation is live per workspace (a new one revokes the old)', (select count(*) from public.workspace_invitations where workspace_id = wa and accepted_at is null and revoked_at is null) = 1);
  perform pg_temp.as_user(b);
  perform pg_temp.rec('the replaced link no longer works', (public.invitation_preview(code) ->> 'status') = 'revoked');
  m := pg_temp.try('select public.accept_invitation(''' || code || ''')');
  perform pg_temp.rec('accepting a revoked link is refused', m = 'invalid_invitation', m);
  perform pg_temp.as_user(b);
  perform pg_temp.rec('only the owner can create invitations', pg_temp.try('select public.create_invitation()') = 'not_owner');

  -- ===== preview =====
  perform pg_temp.as_anon();
  r := public.invitation_preview(code2);
  perform pg_temp.rec('preview works before sign-in and names the inviter and workspace', r ->> 'status' = 'valid' and r ->> 'caller' = 'anonymous' and r ->> 'inviter_name' = 'Alice' and r ->> 'workspace_name' = 'Alice and Bob', r::text);
  perform pg_temp.rec('preview reveals nothing else (no ids, no email)', not (r ? 'workspace_id') and not (r::text like '%@%'));
  perform pg_temp.rec('garbage and unknown codes preview as invalid', (public.invitation_preview('nope') ->> 'status') = 'invalid' and (public.invitation_preview(repeat('x', 32)) ->> 'status') = 'invalid' and (public.invitation_preview(null) ->> 'status') = 'invalid');
  perform pg_temp.as_user(a);
  perform pg_temp.rec('the inviter opening their own link is told so', (public.invitation_preview(code2) ->> 'caller') = 'inviter');
  perform pg_temp.as_user(b);
  perform pg_temp.rec('a person without a workspace can join', (public.invitation_preview(code2) ->> 'caller') = 'free');

  -- ===== self invitation =====
  perform pg_temp.as_user(a);
  m := pg_temp.try('select public.accept_invitation(''' || code2 || ''')');
  perform pg_temp.rec('you cannot join your own workspace through your own invitation', m in ('own_invitation', 'already_in_workspace'), m);

  -- ===== authentication required =====
  perform pg_temp.as_anon();
  m := pg_temp.try('select public.accept_invitation(''' || code2 || ''')');
  perform pg_temp.rec('accepting requires sign-in', m <> 'ok', m);

  -- ===== success =====
  perform pg_temp.as_user(b);
  m := pg_temp.try('select public.accept_invitation(''' || code2 || ''')');
  perform pg_temp.rec('a signed-in person accepts and becomes the partner', m = 'ok', m);
  perform pg_temp.as_admin();
  perform pg_temp.rec('membership recorded (partner role) and invitation consumed by that person', exists (select 1 from public.workspace_members where workspace_id = wa and user_id = b and role = 'partner') and exists (select 1 from public.workspace_invitations where accepted_by = b and accepted_at is not null));
  perform pg_temp.rec('the workspace has exactly two members', (select count(*) from public.workspace_members where workspace_id = wa) = 2);
  perform pg_temp.as_user(b);
  perform pg_temp.rec('both see the same workspace and each other', pg_temp.val('select count(*) from public.workspace_members') = '2' and pg_temp.val('select count(*) from public.profiles') = '2');

  -- ===== reuse / duplicate / concurrent (the second attempt behaves exactly like a racing loser) =====
  perform pg_temp.as_user(b);
  m := pg_temp.try('select public.accept_invitation(''' || code2 || ''')');
  perform pg_temp.rec('accepting twice is refused (already a member)', m = 'already_in_workspace', m);
  perform pg_temp.as_user(c);
  perform pg_temp.rec('a used link previews as used', (public.invitation_preview(code2) ->> 'status') = 'used');
  m := pg_temp.try('select public.accept_invitation(''' || code2 || ''')');
  perform pg_temp.rec('a used link cannot be reused by anyone else', m in ('invitation_used', 'workspace_full'), m);
  perform pg_temp.as_admin();
  perform pg_temp.rec('still exactly two members after the racing attempt', (select count(*) from public.workspace_members where workspace_id = wa) = 2);

  -- ===== workspace already full: a fresh invitation cannot be made, and an old one cannot add a third =====
  perform pg_temp.as_user(a);
  perform pg_temp.rec('a full workspace cannot create invitations', pg_temp.try('select public.create_invitation()') = 'workspace_full');

  -- ===== expiry =====
  perform pg_temp.as_user(d); wd := public.create_workspace('Dan solo');
  code := public.create_invitation() ->> 'code';
  perform pg_temp.as_admin();
  update public.workspace_invitations set expires_at = now() - interval '1 minute' where workspace_id = wd and accepted_at is null;
  perform pg_temp.as_user(c);
  perform pg_temp.rec('an expired link previews as expired', (public.invitation_preview(code) ->> 'status') = 'expired');
  m := pg_temp.try('select public.accept_invitation(''' || code || ''')');
  perform pg_temp.rec('an expired link cannot be accepted', m = 'invitation_expired', m);
  perform pg_temp.as_admin();
  perform pg_temp.rec('an expired attempt changes nothing', not exists (select 1 from public.workspace_members where user_id = c));

  -- ===== THE REPAIR: someone alone in an EMPTY workspace may join =====
  perform pg_temp.as_admin();
  update public.workspace_invitations set expires_at = now() + interval '7 days' where workspace_id = wd and accepted_at is null;
  perform pg_temp.as_user(e); wc := public.create_workspace('Eve own empty workspace');
  perform pg_temp.rec('a person alone in an empty workspace is told they can join', (public.invitation_preview(code) ->> 'caller') = 'replaceable');
  m := pg_temp.try('select public.accept_invitation(''' || code || ''')');
  perform pg_temp.rec('...and joining works (the repair for the reported bug)', m = 'ok', m);
  perform pg_temp.as_admin();
  perform pg_temp.rec('their empty workspace is gone and they are now Dan''s partner', not exists (select 1 from public.workspaces where id = wc) and exists (select 1 from public.workspace_members where workspace_id = wd and user_id = e and role = 'partner'));
  perform pg_temp.rec('they belong to exactly one workspace', (select count(*) from public.workspace_members where user_id = e) = 1);

  -- ===== data is never discarded =====
  perform pg_temp.as_user(f); wb := public.create_workspace('Finn with data');
  insert into public.tasks (workspace_id, kind, title, created_by, task_date) values (wb, 'daily', 'Important', f, '2030-01-01');
  perform pg_temp.as_user(g); wg := public.create_workspace('Gus');
  code := public.create_invitation() ->> 'code';
  perform pg_temp.as_user(f);
  perform pg_temp.rec('a workspace that holds tasks is NOT replaceable', (public.invitation_preview(code) ->> 'caller') = 'blocked');
  m := pg_temp.try('select public.accept_invitation(''' || code || ''')');
  perform pg_temp.rec('joining from a workspace with data is refused', m = 'already_in_workspace', m);
  perform pg_temp.as_admin();
  perform pg_temp.rec('their workspace and task are untouched', exists (select 1 from public.workspaces where id = wb) and exists (select 1 from public.tasks where workspace_id = wb and title = 'Important'));
  perform pg_temp.rec('the invitation stays valid for someone else', (select accepted_at is null from public.workspace_invitations where workspace_id = wg and revoked_at is null));
  -- a person in a TWO-member workspace can never be pulled out of it
  perform pg_temp.as_user(a);
  perform pg_temp.rec('a member of a full workspace is blocked', (public.invitation_preview(code) ->> 'caller') = 'blocked');
  m := pg_temp.try('select public.accept_invitation(''' || code || ''')');
  perform pg_temp.rec('...and cannot join another workspace', m = 'already_in_workspace', m);
  perform pg_temp.as_admin();
  perform pg_temp.rec('Alice and Bob are still partners', (select count(*) from public.workspace_members where workspace_id = wa) = 2);

  -- ===== RLS / unauthorised membership changes =====
  perform pg_temp.as_user(c);
  perform pg_temp.rec('clients cannot read invitations', pg_temp.try('select count(*) from public.workspace_invitations') <> 'ok');
  m := pg_temp.try('insert into public.workspace_members (workspace_id, user_id, role) values (''' || wg || ''', ''' || c || ''', ''partner'')');
  perform pg_temp.rec('clients cannot add themselves to a workspace', m <> 'ok', m);
  m := pg_temp.try('insert into public.workspace_invitations (workspace_id, created_by, code_hash) values (''' || wg || ''', ''' || c || ''', ''abc'')');
  perform pg_temp.rec('clients cannot create invitations directly', m <> 'ok', m);
  m := pg_temp.try('select public.solo_empty_workspace(''' || c || ''')');
  perform pg_temp.rec('the internal helper is not callable by clients', m <> 'ok', m);
  perform pg_temp.as_user(d);
  m := pg_temp.try('delete from public.workspace_members where user_id = ''' || e || '''');
  perform pg_temp.rec('a member cannot remove the other member', (select count(*) from public.workspace_members where workspace_id = wd) = 2);
  perform pg_temp.as_admin();
  perform pg_temp.rec('membership rows are unchanged by that attempt', (select count(*) from public.workspace_members where workspace_id = wd) = 2);
end $$;

select n, case when passed then 'PASS' else 'FAIL' end as result, name, detail from test_results order by n;
select count(*) filter (where passed) as passed, count(*) filter (where not passed) as failed, count(*) as total from test_results;

rollback;
