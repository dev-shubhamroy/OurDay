-- OurDay · Android device tokens (migration 12, prepared).
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
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); m text;
begin
  insert into auth.users (id, email, raw_user_meta_data) values (a, 'a@dt.test', '{"name":"Aria"}'), (b, 'b@dt.test', '{"name":"Ben"}');
  perform pg_temp.as_user(a);
  m := pg_temp.try('insert into public.device_tokens (token) values (''' || repeat('a', 40) || ''')');
  perform pg_temp.rec('a person registers their own device (owner defaults to them)', m = 'ok', m);
  m := pg_temp.try('insert into public.device_tokens (user_id, token) values (''' || b || ''', ''' || repeat('b', 40) || ''')');
  perform pg_temp.rec('cannot register a device for someone else', m <> 'ok', m);
  m := pg_temp.try('insert into public.device_tokens (token) values (''' || repeat('a', 40) || ''')');
  perform pg_temp.rec('the same token cannot be registered twice', m <> 'ok', m);
  m := pg_temp.try('insert into public.device_tokens (token, route) values (''' || repeat('c', 40) || ''', ''smoke'')');
  perform pg_temp.rec('only known delivery routes are accepted', m <> 'ok', m);
  perform pg_temp.as_user(b);
  perform pg_temp.rec('another person sees none of my devices', pg_temp.val('select count(*) from public.device_tokens') = '0');
  perform pg_temp.try('delete from public.device_tokens');
  perform pg_temp.as_admin();
  perform pg_temp.rec('another person cannot delete my device', (select count(*) from public.device_tokens where user_id = a) = 1);
  perform pg_temp.as_user(a);
  perform pg_temp.try('delete from public.device_tokens where token = ''' || repeat('a', 40) || '''');
  perform pg_temp.rec('sign-out removes this phone''s token', pg_temp.val('select count(*) from public.device_tokens') = '0');
  perform pg_temp.as_anon();
  perform pg_temp.rec('anon cannot read devices', pg_temp.try('select * from public.device_tokens') <> 'ok');
  perform pg_temp.as_admin();
end $$;

select n, case when passed then 'PASS' else 'FAIL' end as result, name, detail from test_results order by n;
select count(*) filter (where passed) as passed, count(*) filter (where not passed) as failed, count(*) as total from test_results;

rollback;
