-- OurDay · SQL security tests for the Inspiration Library (migration 9).
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
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); qa uuid; m text; i int;
begin
  insert into auth.users (id, email, raw_user_meta_data) values (a, 'a@quote.test', '{"name":"Aria"}'), (b, 'b@quote.test', '{"name":"Ben"}');
  perform pg_temp.as_user(a); perform public.create_workspace('Q');
  perform pg_temp.as_admin();

  perform pg_temp.as_user(a);
  m := pg_temp.try('insert into public.inspiration_quotes (text, author) values (''Keep going.'', ''  Someone  '')');
  perform pg_temp.rec('a person can add a quote (owner defaults to them)', m = 'ok', m);
  m := pg_temp.try('insert into public.inspiration_quotes (text) values (''No author needed'')');
  perform pg_temp.rec('author is optional', m = 'ok', m);
  perform pg_temp.rec('author is trimmed', pg_temp.val('select author from public.inspiration_quotes where text = ''Keep going.''') = 'Someone');
  m := pg_temp.try('insert into public.inspiration_quotes (text) values (''   '')');
  perform pg_temp.rec('blank quote rejected', m <> 'ok', m);
  m := pg_temp.try('insert into public.inspiration_quotes (text) values (''' || repeat('x', 501) || ''')');
  perform pg_temp.rec('over-long quote rejected', m <> 'ok', m);
  m := pg_temp.try('insert into public.inspiration_quotes (user_id, text) values (''' || b || ''', ''For Ben'')');
  perform pg_temp.rec('cannot add a quote for someone else', m <> 'ok', m);
  qa := pg_temp.val('select id from public.inspiration_quotes where text = ''Keep going.''')::uuid;
  m := pg_temp.try('update public.inspiration_quotes set text = ''Keep going, always.'', author = null where id = ''' || qa || '''');
  perform pg_temp.rec('a person can edit their quote and clear the author', m = 'ok' and pg_temp.val('select author is null from public.inspiration_quotes where id = ''' || qa || '''') = 'true', m);
  m := pg_temp.try('update public.inspiration_quotes set user_id = ''' || b || ''' where id = ''' || qa || '''');
  perform pg_temp.rec('ownership cannot be reassigned', m <> 'ok', m);

  perform pg_temp.as_admin();
  perform pg_temp.as_user(b);
  perform pg_temp.rec('another person sees none of my quotes', pg_temp.val('select count(*) from public.inspiration_quotes') = '0');
  perform pg_temp.try('update public.inspiration_quotes set text = ''hacked'' where id = ''' || qa || '''');
  perform pg_temp.try('delete from public.inspiration_quotes where id = ''' || qa || '''');
  perform pg_temp.as_admin();
  perform pg_temp.rec('another person cannot edit or delete my quote', (select text from public.inspiration_quotes where id = qa) = 'Keep going, always.');
  perform pg_temp.as_anon();
  m := pg_temp.try('select * from public.inspiration_quotes');
  perform pg_temp.rec('anon cannot read quotes', m <> 'ok', m);

  perform pg_temp.as_user(a);
  perform pg_temp.try('delete from public.inspiration_quotes where id = ''' || qa || '''');
  perform pg_temp.rec('a person can delete their quote', pg_temp.val('select count(*) from public.inspiration_quotes where id = ''' || qa || '''') = '0');

  perform pg_temp.as_admin();
  for i in 1..200 loop insert into public.inspiration_quotes (user_id, text) values (b, 'q' || i); end loop;
  m := pg_temp.try('insert into public.inspiration_quotes (user_id, text) values (''' || b || ''', ''one too many'')');
  perform pg_temp.rec('a library is capped at 200 quotes', m <> 'ok', m);
end $$;

select n, case when passed then 'PASS' else 'FAIL' end as result, name, detail from test_results order by n;
select count(*) filter (where passed) as passed, count(*) filter (where not passed) as failed, count(*) as total from test_results;

rollback;
