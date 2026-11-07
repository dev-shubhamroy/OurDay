-- OurDay · SQL security tests for tasks, habits and habit logs (migration 4).
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
  a uuid := gen_random_uuid();  -- member 1 (owner)
  b uuid := gen_random_uuid();  -- member 2 (partner)
  c uuid := gen_random_uuid();  -- outsider with no workspace
  d uuid := gen_random_uuid();  -- member of a different workspace
  e uuid := gen_random_uuid();  -- owner of that different workspace
  w1 uuid; w2 uuid; code text;
  t1 uuid; h1 uuid; h2 uuid;
  m text;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (a, 'a@test.local', '{"name":"Alice"}'), (b, 'b@test.local', '{"name":"Bob"}'),
    (c, 'c@test.local', '{}'), (d, 'd@test.local', '{"name":"Dan"}'), (e, 'e@test.local', '{"name":"Eve"}');

  -- Workspace 1 (a + b) and workspace 2 (e + d), created through the real functions
  perform pg_temp.as_user(a); w1 := pg_temp.val('select public.create_workspace(''Ours'')')::uuid;
  code := pg_temp.val('select public.create_invitation() ->> ''code''');
  perform pg_temp.as_user(b); perform pg_temp.val('select public.accept_invitation(''' || code || ''')');
  perform pg_temp.as_user(e); w2 := pg_temp.val('select public.create_workspace(''Theirs'')')::uuid;
  code := pg_temp.val('select public.create_invitation() ->> ''code''');
  perform pg_temp.as_user(d); perform pg_temp.val('select public.accept_invitation(''' || code || ''')');
  perform pg_temp.as_admin();

  -- ===================== TASKS =====================
  perform pg_temp.as_user(a);
  t1 := pg_temp.val('insert into public.tasks (workspace_id, kind, title, created_by, task_date) values (''' || w1 || ''', ''daily'', ''Practice DSA'', ''' || a || ''', current_date) returning id')::uuid;
  m := pg_temp.try('insert into public.tasks (workspace_id, kind, title, created_by, task_date, due_at, notify_second_user) values (''' || w1 || ''', ''deadline'', ''Submit report'', ''' || a || ''', current_date, now() + interval ''3 hours'', true)');
  perform pg_temp.as_admin();
  perform pg_temp.rec('member creates a daily task', t1 is not null);
  perform pg_temp.rec('member creates a deadline with a timestamp', m = 'ok', m);

  perform pg_temp.as_user(b);
  perform pg_temp.rec('partner sees the creator''s tasks (shared visibility)', pg_temp.val('select count(*) from public.tasks') = '2');
  perform pg_temp.rec('notify flag does not restrict access', pg_temp.val('select count(*) from public.tasks where notify_second_user = false') = '1');
  perform pg_temp.as_user(c);
  perform pg_temp.rec('outsider sees no tasks', pg_temp.val('select count(*) from public.tasks') = '0');
  perform pg_temp.as_user(d);
  perform pg_temp.rec('other workspace sees no tasks', pg_temp.val('select count(*) from public.tasks') = '0');
  perform pg_temp.as_admin();

  perform pg_temp.as_user(c);
  m := pg_temp.try('insert into public.tasks (workspace_id, kind, title, created_by, task_date) values (''' || w1 || ''', ''daily'', ''Sneaky'', ''' || c || ''', current_date)');
  perform pg_temp.as_admin();
  perform pg_temp.rec('outsider cannot insert into a workspace', m <> 'ok', m);
  perform pg_temp.as_user(d);
  m := pg_temp.try('insert into public.tasks (workspace_id, kind, title, created_by, task_date) values (''' || w1 || ''', ''daily'', ''Sneaky'', ''' || d || ''', current_date)');
  perform pg_temp.as_admin();
  perform pg_temp.rec('member of another workspace cannot insert into this one', m <> 'ok', m);
  perform pg_temp.as_user(b);
  m := pg_temp.try('insert into public.tasks (workspace_id, kind, title, created_by, task_date) values (''' || w1 || ''', ''daily'', ''Forged'', ''' || a || ''', current_date)');
  perform pg_temp.as_admin();
  perform pg_temp.rec('cannot create a task in someone else''s name', m <> 'ok', m);
  perform pg_temp.as_user(a);
  m := pg_temp.try('insert into public.tasks (workspace_id, kind, title, created_by, task_date) values (''' || w1 || ''', ''deadline'', ''No time'', ''' || a || ''', current_date)');
  perform pg_temp.rec('deadline without due_at is rejected', m <> 'ok', m);
  m := pg_temp.try('insert into public.tasks (workspace_id, kind, title, created_by, task_date, due_at) values (''' || w1 || ''', ''daily'', ''Has due'', ''' || a || ''', current_date, now())');
  perform pg_temp.rec('daily task with due_at is rejected', m <> 'ok', m);
  m := pg_temp.try('insert into public.tasks (workspace_id, kind, title, created_by, task_date) values (''' || w1 || ''', ''daily'', ''   '', ''' || a || ''', current_date)');
  perform pg_temp.rec('blank title is rejected', m <> 'ok', m);
  perform pg_temp.as_admin();

  -- both members can edit; identity/workspace fields are immutable
  perform pg_temp.as_user(b);
  perform pg_temp.rec('partner can edit the creator''s task', pg_temp.val('with u as (update public.tasks set title = ''Practice DSA hard'' where id = ''' || t1 || ''' returning 1) select count(*) from u') = '1');
  m := pg_temp.try('update public.tasks set created_by = ''' || b || ''' where id = ''' || t1 || '''');
  perform pg_temp.rec('created_by is immutable', m = 'immutable_field', m);
  m := pg_temp.try('update public.tasks set workspace_id = ''' || w2 || ''' where id = ''' || t1 || '''');
  perform pg_temp.rec('workspace_id is immutable (no moving tasks)', m <> 'ok', m);
  perform pg_temp.as_admin();

  -- single completion record, set server-side
  perform pg_temp.as_user(b);
  perform pg_temp.try('update public.tasks set status = ''completed'', completed_by = ''' || a || ''', completed_at = ''2000-01-01'' where id = ''' || t1 || '''');
  perform pg_temp.as_admin();
  perform pg_temp.rec('completion records the actual completer (forgery ignored)', (select completed_by from public.tasks where id = t1) = b);
  perform pg_temp.rec('completion time is set by the server', (select completed_at from public.tasks where id = t1) > now() - interval '1 minute');
  perform pg_temp.rec('there is exactly one completion record per task', (select count(*) from public.tasks where id = t1 and status = 'completed') = 1);
  perform pg_temp.as_user(a);
  perform pg_temp.try('update public.tasks set status = ''completed'', completed_by = ''' || a || ''' where id = ''' || t1 || '''');
  perform pg_temp.as_admin();
  perform pg_temp.rec('re-completing does not overwrite the original record', (select completed_by from public.tasks where id = t1) = b);
  perform pg_temp.as_user(a);
  perform pg_temp.try('update public.tasks set status = ''open'' where id = ''' || t1 || '''');
  perform pg_temp.as_admin();
  perform pg_temp.rec('reopening clears the completion record', (select completed_at is null and completed_by is null from public.tasks where id = t1));

  -- delete
  perform pg_temp.as_user(c);
  perform pg_temp.rec('outsider cannot delete tasks (0 rows)', pg_temp.val('with x as (delete from public.tasks where id = ''' || t1 || ''' returning 1) select count(*) from x') = '0');
  perform pg_temp.as_user(b);
  perform pg_temp.rec('member can delete a task', pg_temp.val('with x as (delete from public.tasks where id = ''' || t1 || ''' returning 1) select count(*) from x') = '1');
  perform pg_temp.as_admin();

  -- ===================== HABITS =====================
  perform pg_temp.as_user(a);
  h1 := pg_temp.val('insert into public.habits (workspace_id, title, created_by, is_shared, owner_id, start_date) values (''' || w1 || ''', ''Exercise'', ''' || a || ''', false, ''' || a || ''', current_date - 10) returning id')::uuid;
  h2 := pg_temp.val('insert into public.habits (workspace_id, title, created_by, is_shared, schedule_days, start_date) values (''' || w1 || ''', ''Read'', ''' || a || ''', true, array[1,2,3,4,5]::smallint[], current_date - 10) returning id')::uuid;
  m := pg_temp.try('insert into public.habits (workspace_id, title, created_by, is_shared, owner_id, start_date) values (''' || w1 || ''', ''For Bob'', ''' || a || ''', false, ''' || b || ''', current_date)');
  perform pg_temp.rec('can create personal and shared habits', h1 is not null and h2 is not null);
  perform pg_temp.rec('cannot create a personal habit owned by someone else', m <> 'ok', m);
  m := pg_temp.try('insert into public.habits (workspace_id, title, created_by, is_shared, start_date) values (''' || w1 || ''', ''Bad'', ''' || a || ''', false, current_date)');
  perform pg_temp.rec('personal habit needs an owner', m <> 'ok', m);
  m := pg_temp.try('insert into public.habits (workspace_id, title, created_by, is_shared, schedule_days, start_date) values (''' || w1 || ''', ''Bad days'', ''' || a || ''', true, array[7]::smallint[], current_date)');
  perform pg_temp.rec('invalid weekday is rejected', m <> 'ok', m);
  perform pg_temp.as_admin();

  perform pg_temp.as_user(b);
  perform pg_temp.rec('partner sees the creator''s personal habit and the shared habit', pg_temp.val('select count(*) from public.habits') = '2');
  perform pg_temp.rec('partner can pause the creator''s habit (full access)', pg_temp.val('with u as (update public.habits set paused = true where id = ''' || h1 || ''' returning 1) select count(*) from u') = '1');
  m := pg_temp.try('update public.habits set is_shared = true, owner_id = null where id = ''' || h1 || '''');
  perform pg_temp.rec('habit scope and owner are immutable', m = 'immutable_field', m);
  perform pg_temp.as_user(c);
  perform pg_temp.rec('outsider sees no habits', pg_temp.val('select count(*) from public.habits') = '0');
  perform pg_temp.as_user(d);
  perform pg_temp.rec('other workspace sees no habits', pg_temp.val('select count(*) from public.habits') = '0');
  perform pg_temp.as_admin();

  -- independent per-person completion
  perform pg_temp.as_user(a);
  m := pg_temp.try('insert into public.habit_logs (habit_id, user_id, workspace_id, day, status) values (''' || h2 || ''', ''' || a || ''', ''' || w1 || ''', current_date, ''done'')');
  perform pg_temp.rec('person completes a shared habit for themself', m = 'ok', m);
  m := pg_temp.try('insert into public.habit_logs (habit_id, user_id, workspace_id, day, status) values (''' || h2 || ''', ''' || b || ''', ''' || w1 || ''', current_date, ''done'')');
  perform pg_temp.rec('cannot complete a habit on behalf of the partner', m <> 'ok', m);
  perform pg_temp.as_admin();
  perform pg_temp.rec('completion time recorded', (select done_at is not null from public.habit_logs where user_id = a and habit_id = h2));
  perform pg_temp.rec('partner has NO completion after the other person completed (independence)', (select count(*) from public.habit_logs where user_id = b and habit_id = h2) = 0);

  perform pg_temp.as_user(b);
  m := pg_temp.try('insert into public.habit_logs (habit_id, user_id, workspace_id, day, status) values (''' || h2 || ''', ''' || b || ''', ''' || w1 || ''', current_date, ''missed'')');
  perform pg_temp.rec('partner records their own (different) status for the same day', m = 'ok', m);
  perform pg_temp.rec('both people''s logs are visible to both', pg_temp.val('select count(*) from public.habit_logs where habit_id = ''' || h2 || '''') = '2');
  perform pg_temp.rec('partner cannot delete the other person''s log (0 rows)', pg_temp.val('with x as (delete from public.habit_logs where user_id = ''' || a || ''' returning 1) select count(*) from x') = '0');
  perform pg_temp.rec('partner cannot edit the other person''s log (0 rows)', pg_temp.val('with u as (update public.habit_logs set status = ''missed'', done_at = null where user_id = ''' || a || ''' returning 1) select count(*) from u') = '0');
  m := pg_temp.try('insert into public.habit_logs (habit_id, user_id, workspace_id, day, status) values (''' || h1 || ''', ''' || b || ''', ''' || w1 || ''', current_date, ''done'')');
  perform pg_temp.rec('non-participant cannot log someone else''s personal habit', m <> 'ok', m);
  perform pg_temp.as_admin();
  perform pg_temp.rec('personal habit only ever has its owner''s logs', (select count(*) from public.habit_logs where habit_id = h1 and user_id <> a) = 0);

  perform pg_temp.as_user(d);
  m := pg_temp.try('insert into public.habit_logs (habit_id, user_id, workspace_id, day, status) values (''' || h2 || ''', ''' || d || ''', ''' || w2 || ''', current_date, ''done'')');
  perform pg_temp.rec('other workspace cannot log against this workspace''s habit', m <> 'ok', m);
  perform pg_temp.rec('other workspace sees no habit logs', pg_temp.val('select count(*) from public.habit_logs') = '0');
  perform pg_temp.as_user(c);
  perform pg_temp.rec('outsider sees no habit logs', pg_temp.val('select count(*) from public.habit_logs') = '0');
  perform pg_temp.as_admin();

  -- a person can undo their own completion
  perform pg_temp.as_user(a);
  perform pg_temp.rec('person can undo their own completion', pg_temp.val('with x as (delete from public.habit_logs where user_id = ''' || a || ''' and habit_id = ''' || h2 || ''' returning 1) select count(*) from x') = '1');
  perform pg_temp.as_admin();
  perform pg_temp.rec('undoing one person''s log leaves the other''s intact', (select count(*) from public.habit_logs where user_id = b and habit_id = h2) = 1);

  -- anon
  perform pg_temp.as_anon();
  m := pg_temp.try('select * from public.tasks');
  perform pg_temp.as_admin();
  perform pg_temp.rec('anon cannot read tasks', m <> 'ok', m);
  perform pg_temp.as_anon();
  m := pg_temp.try('select * from public.habit_logs');
  perform pg_temp.as_admin();
  perform pg_temp.rec('anon cannot read habit logs', m <> 'ok', m);

  -- cascade: deleting a habit removes its logs
  perform pg_temp.as_user(a);
  perform pg_temp.try('delete from public.habits where id = ''' || h2 || '''');
  perform pg_temp.as_admin();
  perform pg_temp.rec('deleting a habit removes its logs', (select count(*) from public.habit_logs where habit_id = h2) = 0);
end $$;

select n, case when passed then 'PASS' else 'FAIL' end as result, name, detail from test_results order by n;
select count(*) filter (where passed) as passed, count(*) filter (where not passed) as failed, count(*) as total from test_results;

rollback;
