-- OurDay · SQL security tests for notifications (migration 5).
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
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  d uuid := gen_random_uuid(); e uuid := gen_random_uuid();
  w1 uuid; w2 uuid; code text; m text;
  T timestamptz := timestamptz '2030-01-01 12:00:00+00';
  secs int; n int;
  tk uuid; tk2 uuid; tk3 uuid; tk4 uuid; tk5 uuid; tk6 uuid; tk7 uuid;
  hp uuid; hs uuid; hb uuid; hpause uuid; hwed uuid; htue uuid; hflag uuid;
  nid uuid;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (a, 'a@test.local', '{"name":"Alice Adams"}'), (b, 'b@test.local', '{"name":"Bob Brown"}'),
    (c, 'c@test.local', '{}'), (d, 'd@test.local', '{"name":"Dan"}'), (e, 'e@test.local', '{"name":"Eve"}');
  perform pg_temp.as_user(a); w1 := pg_temp.val('select public.create_workspace(''Ours'')')::uuid;
  code := pg_temp.val('select public.create_invitation() ->> ''code''');
  perform pg_temp.as_user(b); perform pg_temp.val('select public.accept_invitation(''' || code || ''')');
  perform pg_temp.as_user(e); w2 := pg_temp.val('select public.create_workspace(''Theirs'')')::uuid;
  code := pg_temp.val('select public.create_invitation() ->> ''code''');
  perform pg_temp.as_user(d); perform pg_temp.val('select public.accept_invitation(''' || code || ''')');
  perform pg_temp.as_admin();

  -- ===================== PREFERENCES =====================
  perform pg_temp.as_user(a);
  m := pg_temp.try('insert into public.notification_preferences (user_id, timezone) values (''' || a || ''', ''Asia/Kolkata'')');
  perform pg_temp.rec('person creates their own preferences row', m = 'ok', m);
  m := pg_temp.try('insert into public.notification_preferences (user_id) values (''' || b || ''')');
  perform pg_temp.rec('cannot create preferences for someone else', m <> 'ok', m);
  perform pg_temp.as_user(b);
  perform pg_temp.rec('partner cannot read my preferences', pg_temp.val('select count(*) from public.notification_preferences') = '0');
  m := pg_temp.try('update public.notification_preferences set master = false where user_id = ''' || a || '''');
  perform pg_temp.rec('partner cannot modify my preferences (no rows affected)', pg_temp.val('select master::text from public.notification_preferences') is null);
  perform pg_temp.as_admin();
  perform pg_temp.rec('my preferences unchanged by partner', (select master from public.notification_preferences where user_id = a));
  perform pg_temp.as_user(a);
  m := pg_temp.try('insert into public.notification_preferences (user_id, timezone) values (''' || a || ''', ''UTC'')');
  perform pg_temp.rec('one preferences row per person', m <> 'ok', m);
  m := pg_temp.try('update public.notification_preferences set timezone = ''Europe/Berlin'' where user_id = ''' || a || '''');
  perform pg_temp.rec('person updates their preferences', m = 'ok', m);
  m := pg_temp.try('update public.notification_preferences set timezone = ''Asia/Kolkata'' where user_id = ''' || a || '''');
  perform pg_temp.as_admin();

  -- ===================== DEADLINE REMINDERS =====================
  perform pg_temp.as_user(a);
  tk := pg_temp.val('insert into public.tasks (workspace_id, kind, title, created_by, task_date, due_at, notify_second_user) values (''' || w1 || ''', ''deadline'', ''Submit report'', ''' || a || ''', ''2030-01-01'', ''' || T || ''', true) returning id')::uuid;
  perform pg_temp.as_admin();
  -- exactly the ten required instants, each created when it comes due
  foreach secs in array array[86400, 43200, 21600, 10800, 7200, 3600, 1800, 900, 300, 0] loop
    perform public.generate_notifications_for(a, T - make_interval(secs => secs) + interval '5 seconds');
  end loop;
  perform pg_temp.rec('creator gets exactly 10 reminders as each interval comes due', (select count(*) from public.notifications where user_id = a and task_id = tk and kind = 'deadline') = 10);
  perform pg_temp.rec('reminder instants are due minus the interval', (select count(*) from public.notifications where user_id = a and task_id = tk and occurred_at = T - interval '3 hours') = 1);
  perform public.generate_notifications_for(a, T + interval '10 minutes');
  perform public.generate_notifications_for(a, T + interval '10 minutes');
  perform pg_temp.rec('repeated generation creates no duplicates', (select count(*) from public.notifications where user_id = a and task_id = tk and kind = 'deadline') = 10);
  perform pg_temp.rec('title for the exact deadline', exists (select 1 from public.notifications where user_id = a and task_id = tk and title = 'Deadline now'));
  perform pg_temp.rec('title for an interval', exists (select 1 from public.notifications where user_id = a and task_id = tk and title = 'Due in 30 minutes'));
  -- the partner gets reminders only because Notify second user is on
  perform public.generate_notifications_for(b, T - interval '1 hour' + interval '5 seconds');
  perform pg_temp.rec('partner receives reminders for a shared (notify) deadline, labelled with the owner', exists (select 1 from public.notifications where user_id = b and task_id = tk and body like '%Alice%'));
  -- outsiders and the other workspace never receive anything
  perform public.generate_notifications_for(c, T - interval '1 hour');
  perform public.generate_notifications_for(d, T - interval '1 hour');
  perform pg_temp.rec('outsider and other workspace get nothing for this deadline', (select count(*) from public.notifications where user_id in (c, d, e)) = 0);

  -- not shared: only the creator
  perform pg_temp.as_user(a);
  tk2 := pg_temp.val('insert into public.tasks (workspace_id, kind, title, created_by, task_date, due_at, notify_second_user) values (''' || w1 || ''', ''deadline'', ''Private'', ''' || a || ''', ''2030-01-01'', ''' || T || ''', false) returning id')::uuid;
  perform pg_temp.as_admin();
  perform public.generate_notifications_for(a, T - interval '1 hour' + interval '5 seconds');
  perform public.generate_notifications_for(b, T - interval '1 hour' + interval '5 seconds');
  perform pg_temp.rec('creator is reminded of an unshared deadline', exists (select 1 from public.notifications where user_id = a and task_id = tk2));
  perform pg_temp.rec('partner is NOT reminded of an unshared deadline', not exists (select 1 from public.notifications where user_id = b and task_id = tk2));

  -- completed never notifies
  perform pg_temp.as_user(a);
  tk3 := pg_temp.val('insert into public.tasks (workspace_id, kind, title, created_by, task_date, due_at, status) values (''' || w1 || ''', ''deadline'', ''Done already'', ''' || a || ''', ''2030-01-01'', ''' || T || ''', ''completed'') returning id')::uuid;
  perform pg_temp.as_admin();
  perform public.generate_notifications_for(a, T - interval '1 hour' + interval '5 seconds');
  perform pg_temp.rec('completed deadline never notifies', not exists (select 1 from public.notifications where task_id = tk3 and kind = 'deadline'));
  -- completing before the next interval stops further reminders
  perform pg_temp.as_user(a);
  tk4 := pg_temp.val('insert into public.tasks (workspace_id, kind, title, created_by, task_date, due_at) values (''' || w1 || ''', ''deadline'', ''Will complete'', ''' || a || ''', ''2030-01-01'', ''' || T || ''') returning id')::uuid;
  perform pg_temp.as_admin();
  perform public.generate_notifications_for(a, T - interval '2 hours' + interval '5 seconds');
  perform pg_temp.as_user(a);
  perform pg_temp.try('update public.tasks set status = ''completed'' where id = ''' || tk4 || '''');
  perform pg_temp.as_admin();
  perform public.generate_notifications_for(a, T - interval '1 hour' + interval '5 seconds');
  perform public.generate_notifications_for(a, T + interval '5 seconds');
  perform pg_temp.rec('completing a deadline stops all later reminders', (select count(*) from public.notifications where user_id = a and task_id = tk4 and kind = 'deadline') = 1);
  -- changing the due time creates a fresh, correct set (new dedupe key)
  perform pg_temp.as_user(a);
  tk5 := pg_temp.val('insert into public.tasks (workspace_id, kind, title, created_by, task_date, due_at) values (''' || w1 || ''', ''deadline'', ''Moves'', ''' || a || ''', ''2030-01-01'', ''' || T || ''') returning id')::uuid;
  perform pg_temp.as_admin();
  perform public.generate_notifications_for(a, T - interval '1 hour' + interval '5 seconds');
  perform pg_temp.as_user(a);
  perform pg_temp.try('update public.tasks set due_at = ''' || (T + interval '3 hours') || ''' where id = ''' || tk5 || '''');
  perform pg_temp.as_admin();
  perform public.generate_notifications_for(a, T + interval '2 hours' + interval '5 seconds');   -- 1h before the NEW due time
  perform pg_temp.rec('moved deadline gets reminders for its new time', exists (select 1 from public.notifications where user_id = a and task_id = tk5 and occurred_at = T + interval '2 hours'));
  perform pg_temp.rec('old-time reminders are not repeated or removed (history)', (select count(*) from public.notifications where user_id = a and task_id = tk5 and occurred_at = T - interval '1 hour') = 1);
  -- no back-filling after a long gap, and none once expired
  perform pg_temp.as_user(a);
  tk6 := pg_temp.val('insert into public.tasks (workspace_id, kind, title, created_by, task_date, due_at) values (''' || w1 || ''', ''deadline'', ''Late sync'', ''' || a || ''', ''2030-01-01'', ''' || T || ''') returning id')::uuid;
  perform pg_temp.as_admin();
  perform public.generate_notifications_for(a, T - interval '23 hours 20 minutes');   -- the 24h instant was 40 min ago
  perform pg_temp.rec('intervals older than 30 minutes are not back-filled', not exists (select 1 from public.notifications where task_id = tk6));
  perform public.generate_notifications_for(a, T + interval '2 hours');
  perform pg_temp.rec('no reminders are created after the deadline has expired', not exists (select 1 from public.notifications where task_id = tk6));

  -- preferences are honoured
  perform pg_temp.as_user(b);
  perform pg_temp.try('insert into public.notification_preferences (user_id, master) values (''' || b || ''', false)');
  perform pg_temp.as_admin();
  perform public.generate_notifications_for(b, T - interval '30 minutes' + interval '5 seconds');
  perform pg_temp.rec('master switch off: nothing is generated', not exists (select 1 from public.notifications where user_id = b and occurred_at = T - interval '30 minutes'));
  update public.notification_preferences set master = true, deadlines = false where user_id = b;
  perform public.generate_notifications_for(b, T - interval '15 minutes' + interval '5 seconds');
  perform pg_temp.rec('deadline toggle off: no deadline reminders', not exists (select 1 from public.notifications where user_id = b and occurred_at = T - interval '15 minutes'));
  update public.notification_preferences set deadlines = true where user_id = b;

  -- ===================== HABIT CHECK-IN =====================
  -- 2030-03-05 is a Tuesday. 16:30Z = 22:00 IST; 15:00Z = 20:30 IST.
  perform pg_temp.as_user(a);
  hp := pg_temp.val('insert into public.habits (workspace_id, title, created_by, is_shared, owner_id, start_date) values (''' || w1 || ''', ''Read'', ''' || a || ''', false, ''' || a || ''', ''2030-01-01'') returning id')::uuid;
  hs := pg_temp.val('insert into public.habits (workspace_id, title, created_by, is_shared, start_date) values (''' || w1 || ''', ''Walk'', ''' || a || ''', true, ''2030-01-01'') returning id')::uuid;
  hpause := pg_temp.val('insert into public.habits (workspace_id, title, created_by, is_shared, owner_id, start_date, paused) values (''' || w1 || ''', ''Paused'', ''' || a || ''', false, ''' || a || ''', ''2030-01-01'', true) returning id')::uuid;
  htue := pg_temp.val('insert into public.habits (workspace_id, title, created_by, is_shared, owner_id, start_date, schedule_days) values (''' || w1 || ''', ''Tuesdays'', ''' || a || ''', false, ''' || a || ''', ''2030-01-01'', array[2]) returning id')::uuid;
  hwed := pg_temp.val('insert into public.habits (workspace_id, title, created_by, is_shared, owner_id, start_date, schedule_days) values (''' || w1 || ''', ''Wednesdays'', ''' || a || ''', false, ''' || a || ''', ''2030-01-01'', array[3]) returning id')::uuid;
  perform pg_temp.as_user(b);
  hb := pg_temp.val('insert into public.habits (workspace_id, title, created_by, is_shared, owner_id, start_date) values (''' || w1 || ''', ''Bob personal'', ''' || b || ''', false, ''' || b || ''', ''2030-01-01'') returning id')::uuid;
  perform pg_temp.as_admin();
  perform public.generate_notifications_for(a, timestamptz '2030-03-05 15:00:00+00');
  perform pg_temp.rec('no check-in before 9:30 PM local', (select count(*) from public.notifications where user_id = a and kind = 'habit') = 0);
  perform public.generate_notifications_for(a, timestamptz '2030-03-05 16:30:00+00');
  perform pg_temp.rec('check-in only for MY scheduled, unpaused habits (personal, shared, Tuesday)',
    (select count(*) from public.notifications where user_id = a and kind = 'habit') = 3
    and exists (select 1 from public.notifications where user_id = a and habit_id = hp)
    and exists (select 1 from public.notifications where user_id = a and habit_id = hs)
    and exists (select 1 from public.notifications where user_id = a and habit_id = htue));
  perform pg_temp.rec('paused, wrong-weekday and partner-personal habits are not asked', not exists (select 1 from public.notifications where user_id = a and habit_id in (hpause, hwed, hb)));
  perform pg_temp.rec('check-in fires at 21:30 local (16:00Z)', (select count(*) from public.notifications where user_id = a and kind = 'habit' and occurred_at = timestamptz '2030-03-05 16:00:00+00') = 3);
  perform public.generate_notifications_for(a, timestamptz '2030-03-05 17:00:00+00');
  perform pg_temp.rec('repeated generation creates no duplicate check-ins', (select count(*) from public.notifications where user_id = a and kind = 'habit') = 3);
  -- independent completion: Bob's answer on the shared habit does not complete Alice's
  perform pg_temp.as_user(b);
  perform pg_temp.try('insert into public.habit_logs (habit_id, user_id, workspace_id, day, status) values (''' || hs || ''', ''' || b || ''', ''' || w1 || ''', ''2030-03-05'', ''done'')');
  perform pg_temp.as_admin();
  perform public.generate_notifications_for(b, timestamptz '2030-03-05 22:00:00+00');   -- Bob has no timezone set → UTC, so 22:00Z is after his 21:30
  perform pg_temp.rec('a logged habit is not asked again; the shared habit is still asked of the other person',
    not exists (select 1 from public.notifications where user_id = b and habit_id = hs) and exists (select 1 from public.notifications where user_id = a and habit_id = hs));
  perform pg_temp.rec('Bob is asked about his own personal habit and the others he takes part in', exists (select 1 from public.notifications where user_id = b and habit_id = hb));
  perform pg_temp.rec('shared habit: Bob''s log did not create or complete Alice''s log', (select count(*) from public.habit_logs where habit_id = hs and user_id = a) = 0);

  -- ===================== PARTNER ACTIVITY =====================
  delete from public.notifications where kind = 'partner';
  perform pg_temp.as_user(b);
  tk7 := pg_temp.val('insert into public.tasks (workspace_id, kind, title, created_by, task_date) values (''' || w1 || ''', ''daily'', ''Bobs task'', ''' || b || ''', ''2030-03-05'') returning id')::uuid;
  perform pg_temp.as_user(a);
  perform pg_temp.try('update public.tasks set status = ''completed'' where id = ''' || tk7 || '''');
  perform pg_temp.as_admin();
  perform pg_temp.rec('partner completing MY task notifies me (creator)', exists (select 1 from public.notifications where user_id = b and kind = 'partner' and task_id = tk7 and actor_id = a and title like 'Alice completed%'));
  perform pg_temp.rec('the actor is not notified of their own action', not exists (select 1 from public.notifications where user_id = a and kind = 'partner' and task_id = tk7));
  perform pg_temp.as_user(a);
  tk := pg_temp.val('insert into public.tasks (workspace_id, kind, title, created_by, task_date) values (''' || w1 || ''', ''daily'', ''Alice private'', ''' || a || ''', ''2030-03-05'') returning id')::uuid;
  perform pg_temp.try('update public.tasks set status = ''completed'' where id = ''' || tk || '''');
  perform pg_temp.as_admin();
  perform pg_temp.rec('completing my own UNSHARED task notifies nobody', not exists (select 1 from public.notifications where task_id = tk and kind = 'partner'));
  perform pg_temp.as_user(a);
  tk := pg_temp.val('insert into public.tasks (workspace_id, kind, title, created_by, task_date, notify_second_user) values (''' || w1 || ''', ''daily'', ''Alice shared'', ''' || a || ''', ''2030-03-05'', true) returning id')::uuid;
  perform pg_temp.as_admin();
  perform pg_temp.rec('creating a task shared with Notify second user tells the partner', exists (select 1 from public.notifications where user_id = b and task_id = tk and title like 'Alice shared a task%'));
  perform pg_temp.as_user(a);
  perform pg_temp.try('update public.tasks set status = ''completed'' where id = ''' || tk || '''');
  perform pg_temp.as_admin();
  perform pg_temp.rec('completing a shared (notify) task tells the partner', exists (select 1 from public.notifications where user_id = b and task_id = tk and title like 'Alice completed%'));
  -- habits
  perform pg_temp.as_user(a);
  perform pg_temp.try('insert into public.habit_logs (habit_id, user_id, workspace_id, day, status) values (''' || hs || ''', ''' || a || ''', ''' || w1 || ''', ''2030-03-05'', ''done'')');
  perform pg_temp.try('insert into public.habit_logs (habit_id, user_id, workspace_id, day, status) values (''' || hp || ''', ''' || a || ''', ''' || w1 || ''', ''2030-03-05'', ''done'')');
  perform pg_temp.as_admin();
  perform pg_temp.rec('shared habit check-in tells the partner', exists (select 1 from public.notifications where user_id = b and habit_id = hs and kind = 'partner'));
  perform pg_temp.rec('personal habit without Notify second user tells nobody', not exists (select 1 from public.notifications where habit_id = hp and kind = 'partner'));
  perform pg_temp.as_user(a);
  hflag := pg_temp.val('insert into public.habits (workspace_id, title, created_by, is_shared, owner_id, start_date, notify_second_user) values (''' || w1 || ''', ''Flagged'', ''' || a || ''', false, ''' || a || ''', ''2030-01-01'', true) returning id')::uuid;
  perform pg_temp.try('insert into public.habit_logs (habit_id, user_id, workspace_id, day, status) values (''' || hflag || ''', ''' || a || ''', ''' || w1 || ''', ''2030-03-05'', ''done'')');
  perform pg_temp.as_admin();
  perform pg_temp.rec('personal habit WITH Notify second user tells the partner', exists (select 1 from public.notifications where user_id = b and habit_id = hflag and kind = 'partner'));
  -- re-saving the same completion never duplicates
  perform pg_temp.as_user(a);
  perform pg_temp.try('update public.habit_logs set status = ''done'' where habit_id = ''' || hflag || ''' and user_id = ''' || a || '''');
  perform pg_temp.as_admin();
  perform pg_temp.rec('re-saving a completion does not duplicate the notification', (select count(*) from public.notifications where habit_id = hflag and kind = 'partner') = 1);
  -- recipient preference
  update public.notification_preferences set partner = false where user_id = b;
  perform pg_temp.as_user(a);
  tk := pg_temp.val('insert into public.tasks (workspace_id, kind, title, created_by, task_date, notify_second_user) values (''' || w1 || ''', ''daily'', ''Muted'', ''' || a || ''', ''2030-03-05'', true) returning id')::uuid;
  perform pg_temp.as_admin();
  perform pg_temp.rec('partner-activity toggle off: recipient gets nothing', not exists (select 1 from public.notifications where task_id = tk));
  update public.notification_preferences set partner = true where user_id = b;

  -- ===================== ISOLATION AND CLIENT RIGHTS =====================
  perform pg_temp.rec('nothing ever reached the outsider or the other workspace', (select count(*) from public.notifications where user_id in (c, d, e)) = 0);
  perform pg_temp.as_user(a);
  perform pg_temp.rec('I only see my own notifications', pg_temp.val('select count(*) from public.notifications where user_id <> ''' || a || '''') = '0' and pg_temp.val('select count(*) from public.notifications') <> '0');
  nid := pg_temp.val('select id from public.notifications where kind = ''deadline'' limit 1')::uuid;
  m := pg_temp.try('update public.notifications set read_at = now() where id = ''' || nid || '''');
  perform pg_temp.rec('I can mark my notification read', m = 'ok' and pg_temp.val('select (read_at is not null)::text from public.notifications where id = ''' || nid || '''') = 'true', m);
  m := pg_temp.try('update public.notifications set title = ''hacked'' where id = ''' || nid || '''');
  perform pg_temp.rec('I cannot change anything except read_at', m <> 'ok', m);
  m := pg_temp.try('insert into public.notifications (user_id, workspace_id, kind, title, body, dedupe_key) values (''' || a || ''', ''' || w1 || ''', ''deadline'', ''x'', ''y'', ''forged'')');
  perform pg_temp.rec('clients cannot insert notifications', m <> 'ok', m);
  m := pg_temp.try('delete from public.notifications');
  perform pg_temp.rec('clients cannot delete notifications', m <> 'ok', m);
  perform pg_temp.as_user(b);
  perform pg_temp.rec('partner cannot see or mark my notifications', pg_temp.val('select count(*) from public.notifications where id = ''' || nid || '''') = '0');
  perform pg_temp.try('update public.notifications set read_at = now() where user_id = ''' || a || '''');
  perform pg_temp.as_admin();
  perform pg_temp.rec('partner''s attempt left my unread state alone', (select count(*) from public.notifications where user_id = a and read_at is null) > 0);
  perform pg_temp.as_user(c);
  perform pg_temp.rec('outsider sees nothing', pg_temp.val('select count(*) from public.notifications') = '0');
  perform pg_temp.as_user(d);
  perform pg_temp.rec('other workspace sees nothing of ours', pg_temp.val('select count(*) from public.notifications') = '0');
  perform pg_temp.as_anon();
  m := pg_temp.try('select * from public.notifications');
  perform pg_temp.rec('anon cannot read notifications', m <> 'ok', m);
  perform pg_temp.as_anon();
  m := pg_temp.try('select public.generate_my_notifications()');
  perform pg_temp.rec('anon cannot generate', m <> 'ok', m);
  perform pg_temp.as_user(a);
  perform pg_temp.rec('signed-in person can generate their own', pg_temp.try('select public.generate_my_notifications()') = 'ok');
  m := pg_temp.try('select public.generate_notifications_for(''' || b || ''', now())');
  perform pg_temp.rec('clients cannot generate for someone else', m <> 'ok', m);
  m := pg_temp.try('select public.generate_all_notifications()');
  perform pg_temp.rec('clients cannot run the cron job function', m <> 'ok', m);
  perform pg_temp.as_admin();
  -- history outlives deleted tasks
  perform pg_temp.as_user(a);
  perform pg_temp.try('delete from public.tasks where id = ''' || tk2 || '''');
  perform pg_temp.as_admin();
  perform pg_temp.rec('deleting a task keeps history but clears the reference', exists (select 1 from public.notifications where user_id = a and task_id is null and body like '%Private%'));
  -- deleting a task stops future reminders (no row, nothing to generate)
  perform public.generate_notifications_for(a, T + interval '1 year');
  perform pg_temp.rec('deleted task generates no further reminders', not exists (select 1 from public.notifications where body like '%Private%' and occurred_at > T));
end $$;

select n, case when passed then 'PASS' else 'FAIL' end as result, name, detail from test_results order by n;
select count(*) filter (where passed) as passed, count(*) filter (where not passed) as failed, count(*) as total from test_results;

rollback;
