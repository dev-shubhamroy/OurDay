-- OurDay · deadline reminder scheduling regression tests (migration 8).
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


-- Simulates the scheduler: runs the generator every `step` from `t0` to `t1` (twice per tick, to prove idempotence).
create function pg_temp.run(u uuid, t0 timestamptz, t1 timestamptz, step interval) returns void language plpgsql as $f$
declare t timestamptz := t0;
begin
  while t <= t1 loop
    perform public.generate_notifications_for(u, t);
    perform public.generate_notifications_for(u, t);
    t := t + step;
  end loop;
end $f$;

-- Reminder offsets (seconds before the deadline) actually created for a task, e.g. 300,0.
create function pg_temp.offs(tk uuid) returns text language sql as $f$
  select coalesce(string_agg(extract(epoch from (t.due_at - n.occurred_at))::int::text, ',' order by n.occurred_at), '')
  from public.notifications n join public.tasks t on t.id = n.task_id where n.task_id = tk and n.kind = 'deadline'
$f$;

-- Creates an open deadline as if its schedule had started at `created`.
create function pg_temp.mk(ws uuid, u uuid, title text, due timestamptz, created timestamptz) returns uuid language plpgsql as $f$
declare nid uuid;
begin
  insert into public.tasks (workspace_id, kind, title, created_by, task_date, due_at) values (ws, 'deadline', title, u, '2030-01-01', due) returning id into nid;
  alter table public.tasks disable trigger tasks_reminder_epoch_trg;
  update public.tasks set reminders_from = created where id = nid;
  alter table public.tasks enable trigger tasks_reminder_epoch_trg;
  return nid;
end $f$;

do $$
declare
  a uuid := gen_random_uuid(); w uuid;
  D timestamptz := timestamptz '2030-01-05 01:03:00+05:30';
  tk uuid; before_edit text; real_from timestamptz; nrows int;
begin
  insert into auth.users (id, email, raw_user_meta_data) values (a, 'a@sched.test', '{"name":"Alice"}');
  perform pg_temp.as_user(a); w := public.create_workspace('Sched');
  perform pg_temp.as_admin();
  insert into public.notification_preferences (user_id, timezone) values (a, 'Asia/Kolkata');

  tk := pg_temp.mk(w, a, 'A', D, D - interval '6 minutes');
  perform public.generate_notifications_for(a, D - interval '6 minutes' + interval '5 seconds');
  perform pg_temp.rec('A: nothing is delivered at creation time (the reported bug)', pg_temp.offs(tk) = '');
  perform pg_temp.run(a, D - interval '6 minutes', D + interval '10 minutes', interval '1 minute');
  perform pg_temp.rec('A: 6 min before -> only 5m and exact', pg_temp.offs(tk) = '300,0', pg_temp.offs(tk));

  tk := pg_temp.mk(w, a, 'B', D, D - interval '20 minutes');
  perform pg_temp.run(a, D - interval '20 minutes', D + interval '10 minutes', interval '1 minute');
  perform pg_temp.rec('B: 20 min before -> 15m, 5m, exact', pg_temp.offs(tk) = '900,300,0', pg_temp.offs(tk));

  tk := pg_temp.mk(w, a, 'C', D, D - interval '40 minutes');
  perform pg_temp.run(a, D - interval '40 minutes', D + interval '10 minutes', interval '1 minute');
  perform pg_temp.rec('C: 40 min before -> 30m, 15m, 5m, exact', pg_temp.offs(tk) = '1800,900,300,0', pg_temp.offs(tk));

  tk := pg_temp.mk(w, a, 'D', D, D - interval '2 days');
  perform pg_temp.run(a, D - interval '2 days', D + interval '10 minutes', interval '1 minute');
  perform pg_temp.rec('D: 2 days before -> all ten', pg_temp.offs(tk) = '86400,43200,21600,10800,7200,3600,1800,900,300,0', pg_temp.offs(tk));

  tk := pg_temp.mk(w, a, 'D2', D, D - interval '2 hours');
  perform public.generate_notifications_for(a, D - interval '10 minutes');
  perform pg_temp.rec('D2: a late first run does not replay old reminders', pg_temp.offs(tk) = '', pg_temp.offs(tk));

  tk := pg_temp.mk(w, a, 'E', D, D - interval '3 hours');
  perform pg_temp.run(a, D - interval '3 hours', D - interval '50 minutes', interval '1 minute');
  before_edit := pg_temp.offs(tk);
  update public.tasks set due_at = D + interval '25 minutes' where id = tk;
  select reminders_from into real_from from public.tasks where id = tk;
  perform pg_temp.rec('E: editing the deadline restarts the schedule at the edit time', real_from > now() - interval '1 minute', real_from::text);
  alter table public.tasks disable trigger tasks_reminder_epoch_trg;
  update public.tasks set reminders_from = D - interval '50 minutes' where id = tk;
  alter table public.tasks enable trigger tasks_reminder_epoch_trg;
  perform pg_temp.run(a, D - interval '50 minutes', D + interval '2 hours', interval '1 minute');
  perform pg_temp.rec('E: old-schedule reminders stay as history and none of its later ones fire',
    (select count(*) from public.notifications where task_id = tk and dedupe_key like '%:' || extract(epoch from D)::bigint || ':%') = 3 and before_edit = '10800,7200,3600', before_edit);
  perform pg_temp.rec('E: new schedule has only reminders still ahead of the edit (1h,30m,15m,5m,exact of the NEW deadline)',
    (select string_agg(extract(epoch from ((D + interval '25 minutes') - n.occurred_at))::int::text, ',' order by n.occurred_at) from public.notifications n where n.task_id = tk and n.dedupe_key like '%:' || extract(epoch from D + interval '25 minutes')::bigint || ':%') = '3600,1800,900,300,0');

  tk := pg_temp.mk(w, a, 'F', D, D - interval '2 hours');
  perform pg_temp.run(a, D - interval '2 hours', D - interval '40 minutes', interval '1 minute');
  update public.tasks set status = 'completed' where id = tk;
  perform pg_temp.run(a, D - interval '40 minutes', D + interval '1 hour', interval '1 minute');
  perform pg_temp.rec('F: completed task gets no further reminders', pg_temp.offs(tk) = '7200,3600', pg_temp.offs(tk));
  update public.tasks set status = 'open' where id = tk;
  alter table public.tasks disable trigger tasks_reminder_epoch_trg;
  update public.tasks set reminders_from = D - interval '10 minutes' where id = tk;
  alter table public.tasks enable trigger tasks_reminder_epoch_trg;
  perform pg_temp.run(a, D - interval '10 minutes', D + interval '10 minutes', interval '1 minute');
  perform pg_temp.rec('F: a reopened task gets only reminders still ahead', pg_temp.offs(tk) = '7200,3600,300,0', pg_temp.offs(tk));

  tk := pg_temp.mk(w, a, 'F2', D, D - interval '2 hours');
  delete from public.tasks where id = tk;
  perform pg_temp.run(a, D - interval '2 hours', D + interval '10 minutes', interval '1 minute');
  perform pg_temp.rec('F2: a deleted task gets no reminders', not exists (select 1 from public.notifications where task_id = tk));

  tk := pg_temp.mk(w, a, 'G', D, D - interval '1 hour');
  for i in 1..5 loop perform public.generate_notifications_for(a, D - interval '5 minutes' + interval '10 seconds'); end loop;
  select count(*) into nrows from public.notifications where task_id = tk and dedupe_key like '%:300';
  perform pg_temp.rec('G: five runs at one instant create exactly one 5m reminder', nrows = 1);

  perform pg_temp.as_user(a);
  insert into public.tasks (workspace_id, kind, title, created_by, task_date, due_at) values (w, 'deadline', 'H', a, '2030-01-01', D) returning id into tk;
  perform pg_temp.as_admin();
  perform pg_temp.rec('a new task starts its schedule at creation time', (select reminders_from from public.tasks where id = tk) > now() - interval '1 minute');
  perform pg_temp.as_user(a);
  perform pg_temp.try('update public.tasks set reminders_from = ''2000-01-01'' where id = ''' || tk || '''');
  perform pg_temp.as_admin();
  perform pg_temp.rec('a client cannot rewind reminders_from', (select reminders_from from public.tasks where id = tk) > now() - interval '1 minute');
end $$;

select n, case when passed then 'PASS' else 'FAIL' end as result, name, detail from test_results order by n;
select count(*) filter (where passed) as passed, count(*) filter (where not passed) as failed, count(*) as total from test_results;

rollback;
