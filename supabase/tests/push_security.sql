-- OurDay · SQL security tests for Web Push (migration 6).
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
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); w1 uuid; m text; nid uuid; n int;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (a, 'a@push.test', '{"name":"Aria"}'), (b, 'b@push.test', '{"name":"Ben"}');
  perform pg_temp.as_user(a);
  w1 := public.create_workspace('Push test');
  perform pg_temp.as_admin();

  perform pg_temp.as_user(a);
  m := pg_temp.try('insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (''' || a || ''', ''https://push.example/a1'', ''p256dhkeyvalue-1234'', ''authsecret'')');
  perform pg_temp.rec('a person can register their own device', m = 'ok', m);
  m := pg_temp.try('insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (''' || b || ''', ''https://push.example/b1'', ''p256dhkeyvalue-1234'', ''authsecret'')');
  perform pg_temp.rec('a person cannot register a device for someone else', m <> 'ok', m);
  perform pg_temp.as_admin();
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (b, 'https://push.example/b2', 'p256dhkeyvalue-1234', 'authsecret');

  perform pg_temp.as_user(a);
  perform pg_temp.rec('a person sees only their own devices', pg_temp.val('select count(*) from public.push_subscriptions') = '1');
  perform pg_temp.try('delete from public.push_subscriptions where endpoint = ''https://push.example/b2''');
  perform pg_temp.as_admin();
  perform pg_temp.rec('a person cannot delete someone else''s device', exists (select 1 from public.push_subscriptions where endpoint = 'https://push.example/b2'));
  perform pg_temp.as_anon();
  m := pg_temp.try('select * from public.push_subscriptions');
  perform pg_temp.rec('anon cannot read devices', m <> 'ok', m);

  perform pg_temp.as_admin();
  insert into public.push_config (function_url, secret) values ('https://example.invalid/fn', 's3cret');
  perform pg_temp.as_user(a);
  m := pg_temp.try('select * from public.push_config');
  perform pg_temp.rec('clients cannot read the push secret', m <> 'ok', m);
  m := pg_temp.try('select public.push_dispatch(gen_random_uuid())');
  perform pg_temp.rec('clients cannot call push_dispatch', m <> 'ok', m);
  m := pg_temp.try('select public.push_sweep()');
  perform pg_temp.rec('clients cannot call push_sweep', m <> 'ok', m);
  m := pg_temp.try('update public.notifications set push_sent_at = null');
  perform pg_temp.rec('clients cannot touch push_sent_at', m <> 'ok', m);

  perform pg_temp.as_admin();
  insert into public.notifications (user_id, workspace_id, kind, title, body, dedupe_key) values (a, w1, 'partner', 'Hi', 'There', 'push-test-1') returning id into nid;
  perform pg_temp.rec('notification insert succeeds even when push cannot be sent', nid is not null);
  m := pg_temp.try('insert into public.notifications (user_id, workspace_id, kind, title, body, dedupe_key) values (''' || a || ''', ''' || w1 || ''', ''partner'', ''Hi'', ''There'', ''push-test-1'')');
  perform pg_temp.rec('duplicate notification rejected', m <> 'ok', m);
end $$;

select n, case when passed then 'PASS' else 'FAIL' end as result, name, detail from test_results order by n;
select count(*) filter (where passed) as passed, count(*) filter (where not passed) as failed, count(*) as total from test_results;

rollback;
