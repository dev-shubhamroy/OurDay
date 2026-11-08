-- OurDay · Shared Tasks: creation, visibility, reminders, mutual approval, retention, security (migration 10).
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


create function pg_temp.n(u uuid, st text) returns int language sql as $f$ select count(*)::int from public.notifications where user_id = u and subtype = st $f$;

do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); d uuid := gen_random_uuid(); e uuid := gen_random_uuid();
  w1 uuid; w2 uuid; w3 uuid; code text; m text; r text;
  s1 uuid; s2 uuid; s3 uuid; s4 uuid; s5 uuid; pt uuid; other uuid;
  rid uuid; i int; cnt int;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (a, 'a@sh.test', '{"name":"Alice Adams"}'), (b, 'b@sh.test', '{"name":"Bob Brown"}'), (c, 'c@sh.test', '{"name":"Cara"}'),
    (d, 'd@sh.test', '{"name":"Dan"}'), (e, 'e@sh.test', '{"name":"Eve"}');
  perform pg_temp.as_user(a); w1 := pg_temp.val('select public.create_workspace(''Ours'')')::uuid;
  code := pg_temp.val('select public.create_invitation() ->> ''code''');
  perform pg_temp.as_user(b); perform pg_temp.val('select public.accept_invitation(''' || code || ''')');
  perform pg_temp.as_user(e); w2 := pg_temp.val('select public.create_workspace(''Theirs'')')::uuid;
  code := pg_temp.val('select public.create_invitation() ->> ''code''');
  perform pg_temp.as_user(d); perform pg_temp.val('select public.accept_invitation(''' || code || ''')');
  perform pg_temp.as_user(c); w3 := pg_temp.val('select public.create_workspace(''Solo'')')::uuid;
  perform pg_temp.as_admin();

  -- ===================== CREATION + VISIBILITY =====================
  perform pg_temp.as_user(a);
  s1 := pg_temp.val('insert into public.tasks (workspace_id, kind, title, created_by, task_date, due_at, notes) values (''' || w1 || ''', ''shared'', ''Plan weekend trip'', ''' || a || ''', ''2030-01-01'', ''2030-01-02 10:00+00'', ''Book hotel'') returning id')::uuid;
  s2 := pg_temp.val('insert into public.tasks (workspace_id, kind, title, created_by, task_date) values (''' || w1 || ''', ''shared'', ''Fix the bike'', ''' || a || ''', ''2030-01-01'') returning id')::uuid;
  perform pg_temp.rec('a shared task with a deadline is valid', s1 is not null);
  perform pg_temp.rec('a shared task WITHOUT a deadline is valid', s2 is not null and pg_temp.val('select due_at is null from public.tasks where id = ''' || s2 || '''') = 'true');
  perform pg_temp.val('insert into public.tasks (workspace_id, kind, title, created_by, task_date) values (''' || w1 || ''', ''daily'', ''Alice private-ish daily'', ''' || a || ''', ''2030-01-01'') returning id');
  m := pg_temp.try('insert into public.tasks (workspace_id, kind, title, created_by, task_date, status) values (''' || w1 || ''', ''shared'', ''Sneaky'', ''' || a || ''', ''2030-01-01'', ''completed'')');
  perform pg_temp.rec('creating a shared task as already completed is normalised to active/open', pg_temp.val('select shared_state || status from public.tasks where title = ''Sneaky''') = 'activeopen', m);
  perform pg_temp.as_admin();
  perform pg_temp.rec('shared tasks start active, unfinished and notify both people',
    (select shared_state = 'active' and status = 'open' and notify_second_user and completed_at is null from public.tasks where id = s1));
  perform pg_temp.rec('creating a shared task notifies the other member', exists (select 1 from public.notifications where user_id = b and task_id = s1 and subtype = 'shared_task' and title like 'Alice% added a shared task'));
  perform pg_temp.rec('the creator is not notified about their own task', not exists (select 1 from public.notifications where user_id = a and task_id = s1));

  perform pg_temp.as_user(b);
  perform pg_temp.rec('the other member sees both shared tasks (and the title, notes, creator)', pg_temp.val('select count(*) from public.tasks where kind = ''shared'' and id in (''' || s1 || ''', ''' || s2 || ''')') = '2');
  perform pg_temp.rec('the other member can edit a shared task (title)', pg_temp.try('update public.tasks set title = ''Plan the weekend trip'' where id = ''' || s1 || '''') = 'ok');
  perform pg_temp.as_user(d);
  perform pg_temp.rec('another workspace sees no shared or personal tasks of ours', pg_temp.val('select count(*) from public.tasks where workspace_id = ''' || w1 || '''') = '0');
  perform pg_temp.try('update public.tasks set title = ''pwned'' where id = ''' || s1 || '''');
  perform pg_temp.try('delete from public.tasks where id = ''' || s1 || '''');
  perform pg_temp.as_user(c);
  perform pg_temp.rec('a person with no access sees nothing', pg_temp.val('select count(*) from public.tasks where workspace_id = ''' || w1 || '''') = '0');
  perform pg_temp.as_anon();
  perform pg_temp.rec('anon cannot read tasks', pg_temp.try('select * from public.tasks') <> 'ok');
  perform pg_temp.as_admin();
  perform pg_temp.rec('other workspaces cannot edit or delete our shared task', (select title from public.tasks where id = s1) = 'Plan the weekend trip');

  -- ===================== STATE CAN ONLY CHANGE THROUGH THE FUNCTIONS =====================
  perform pg_temp.as_user(a);
  m := pg_temp.try('update public.tasks set status = ''completed'' where id = ''' || s1 || '''');
  perform pg_temp.rec('a client cannot mark a shared task completed directly', m = 'use_shared_task_functions', m);
  m := pg_temp.try('update public.tasks set shared_state = ''completed'' where id = ''' || s1 || '''');
  perform pg_temp.rec('a client cannot set the shared state directly', m <> 'ok', m);
  m := pg_temp.try('update public.tasks set approved_by = ''' || a || ''' where id = ''' || s1 || '''');
  perform pg_temp.rec('a client cannot forge approval columns', m <> 'ok', m);
  m := pg_temp.try('update public.tasks set kind = ''daily'' where id = ''' || s1 || '''');
  perform pg_temp.rec('the task kind is immutable', m <> 'ok', m);
  m := pg_temp.try('insert into public.shared_task_completions (task_id, workspace_id, requested_by) values (''' || s1 || ''', ''' || w1 || ''', ''' || a || ''')');
  perform pg_temp.rec('clients cannot write the completion history', m <> 'ok', m);
  m := pg_temp.try('select public.shared_notify(''' || b || ''', ''' || w1 || ''', ''x'', ''y'', null, null, ''reminder'', ''k'')');
  perform pg_temp.rec('clients cannot call the internal notify helper', m <> 'ok', m);
  m := pg_temp.try('select public.shared_task_lock(''' || s1 || ''')');
  perform pg_temp.rec('clients cannot call the internal lock helper', m <> 'ok', m);
  m := pg_temp.try('insert into public.notifications (user_id, workspace_id, kind, title, body, dedupe_key) values (''' || b || ''', ''' || w1 || ''', ''partner'', ''fake'', ''fake'', ''x1'')');
  perform pg_temp.rec('clients cannot create notifications directly', m <> 'ok', m);
  perform pg_temp.as_anon();
  m := pg_temp.try('select public.request_shared_completion(''' || s1 || ''')');
  perform pg_temp.rec('anon cannot call the approval functions', m <> 'ok', m);
  perform pg_temp.as_admin();

  -- ===================== COMPLETION: REQUEST =====================
  perform pg_temp.as_user(a);
  r := pg_temp.val('select public.request_shared_completion(''' || s1 || ''')::text');
  perform pg_temp.as_admin();
  perform pg_temp.rec('request completion moves the task to awaiting_approval, NOT completed',
    (select shared_state = 'awaiting_approval' and status = 'open' and completed_at is null and completion_requested_by = a and completion_requested_at is not null from public.tasks where id = s1), r);
  perform pg_temp.rec('the request is recorded (requester, time, previous state)', exists (select 1 from public.shared_task_completions where task_id = s1 and outcome = 'pending' and requested_by = a and previous_state = 'active' and requested_at is not null));
  perform pg_temp.rec('the other person is notified with the task title', exists (select 1 from public.notifications where user_id = b and subtype = 'completion_request' and title = 'Alice says this task is done' and body = '“Plan the weekend trip”' and task_id = s1));
  perform pg_temp.rec('the requester is not notified', not exists (select 1 from public.notifications where user_id = a and subtype = 'completion_request'));

  perform pg_temp.as_user(a);
  m := pg_temp.try('select public.review_shared_completion(''' || s1 || ''', true)');
  perform pg_temp.rec('the requester cannot approve their own request', m = 'cannot_review_own_request', m);
  m := pg_temp.try('select public.review_shared_completion(''' || s1 || ''', false)');
  perform pg_temp.rec('the requester cannot reject their own request', m = 'cannot_review_own_request', m);
  m := pg_temp.try('select public.request_shared_completion(''' || s1 || ''')');
  perform pg_temp.rec('a second request cannot overwrite a pending one (requester)', m = 'already_pending', m);
  perform pg_temp.as_user(b);
  m := pg_temp.try('select public.request_shared_completion(''' || s1 || ''')');
  perform pg_temp.rec('a second request cannot overwrite a pending one (other member)', m = 'already_pending', m);
  perform pg_temp.as_user(d);
  m := pg_temp.try('select public.review_shared_completion(''' || s1 || ''', true)');
  perform pg_temp.rec('another workspace cannot approve', m = 'not_found', m);
  perform pg_temp.as_user(c);
  m := pg_temp.try('select public.review_shared_completion(''' || s1 || ''', true)');
  perform pg_temp.rec('an outsider cannot approve', m = 'not_found', m);
  m := pg_temp.try('select public.request_shared_completion(''' || s1 || ''')');
  perform pg_temp.rec('an outsider cannot request completion', m = 'not_found', m);
  perform pg_temp.as_admin();
  perform pg_temp.rec('exactly one pending request exists', (select count(*) from public.shared_task_completions where task_id = s1 and outcome = 'pending') = 1);
  m := pg_temp.try('insert into public.shared_task_completions (task_id, workspace_id, requested_by) values (''' || s1 || ''', ''' || w1 || ''', ''' || b || ''')');
  perform pg_temp.rec('the database itself refuses a second pending row (unique index, race-proof)', m <> 'ok', m);

  -- history is visible to members only
  perform pg_temp.as_user(b);
  perform pg_temp.rec('the other member can read the approval history', pg_temp.val('select count(*) from public.shared_task_completions where task_id = ''' || s1 || '''') = '1');
  perform pg_temp.as_user(d);
  perform pg_temp.rec('another workspace cannot read the approval history', pg_temp.val('select count(*) from public.shared_task_completions') = '0');

  -- ===================== REMINDERS while awaiting approval =====================
  perform pg_temp.as_user(a);
  r := pg_temp.val('select public.send_task_reminder(''' || s1 || ''', ''  Hey,   let''''s finish this today!  '')::text');
  perform pg_temp.as_admin();
  perform pg_temp.rec('a reminder can be sent while approval is pending, delivered to the other person', r like '%true%' and exists (
    select 1 from public.notifications where user_id = b and subtype = 'reminder' and title = 'Alice reminded you'
      and body = E'“Hey, let''s finish this today!”\nPlan the weekend trip' and task_id = s1 and actor_id = a), r);
  perform pg_temp.rec('the reminder expires 24 hours after it was sent', (select expires_at between now() + interval '23 hours 59 minutes' and now() + interval '24 hours 1 minute' from public.notifications where subtype = 'reminder' and user_id = b));
  perform pg_temp.rec('a reminder never changes the task state', (select shared_state = 'awaiting_approval' and status = 'open' from public.tasks where id = s1));
  perform pg_temp.rec('only the recipient got it (sender and others have none)', not exists (select 1 from public.notifications where subtype = 'reminder' and user_id <> b));
  perform pg_temp.as_user(a);
  perform pg_temp.rec('the sender cannot read the recipient''s reminder', pg_temp.val('select count(*) from public.notifications where subtype = ''reminder''') = '0');
  perform pg_temp.as_user(b);
  perform pg_temp.rec('the recipient can read it', pg_temp.val('select count(*) from public.notifications where subtype = ''reminder''') = '1');
  perform pg_temp.as_user(d);
  perform pg_temp.rec('another workspace cannot read it', pg_temp.val('select count(*) from public.notifications where subtype = ''reminder''') = '0');

  perform pg_temp.as_user(a);
  m := pg_temp.try('select public.send_task_reminder(''' || s1 || ''', ''again right away'')');
  perform pg_temp.rec('cooldown: a second reminder for the same task within 5 minutes is refused', m = 'cooldown', m);
  m := pg_temp.try('select public.send_task_reminder(''' || s1 || ''', ''Hey, let''''s finish this today!'')');
  perform pg_temp.rec('duplicate protection: the same message again is refused', m = 'cooldown', m);
  perform pg_temp.as_admin();
  update public.notifications set created_at = now() - interval '6 minutes' where subtype = 'reminder';
  perform pg_temp.as_user(a);
  perform pg_temp.rec('after the cooldown another reminder can be sent', pg_temp.try('select public.send_task_reminder(''' || s1 || ''', ''Second nudge'')') = 'ok');
  perform pg_temp.as_user(b);
  r := pg_temp.val('select public.send_task_reminder(''' || s1 || ''', ''Bob here, on it'')::text');
  perform pg_temp.as_admin();
  perform pg_temp.rec('reminders work in both directions', exists (select 1 from public.notifications where user_id = a and subtype = 'reminder' and title = 'Bob reminded you'));
  perform pg_temp.as_user(a);
  perform pg_temp.rec('empty message rejected', pg_temp.try('select public.send_task_reminder(''' || s2 || ''', ''   '')') = 'empty_message');
  perform pg_temp.rec('null message rejected', pg_temp.try('select public.send_task_reminder(''' || s2 || ''', null)') = 'empty_message');
  perform pg_temp.rec('over-long message rejected', pg_temp.try('select public.send_task_reminder(''' || s2 || ''', ''' || repeat('x', 201) || ''')') = 'message_too_long');
  perform pg_temp.as_user(d);
  perform pg_temp.rec('another workspace cannot remind about our task', pg_temp.try('select public.send_task_reminder(''' || s2 || ''', ''hi'')') = 'not_found');
  perform pg_temp.as_user(c);
  perform pg_temp.rec('an outsider cannot remind', pg_temp.try('select public.send_task_reminder(''' || s2 || ''', ''hi'')') = 'not_found');
  -- you cannot remind yourself: a workspace with only one member has nobody to remind
  perform pg_temp.as_user(c);
  pt := pg_temp.val('insert into public.tasks (workspace_id, kind, title, created_by, task_date) values (''' || w3 || ''', ''shared'', ''Solo shared'', ''' || c || ''', ''2030-01-01'') returning id')::uuid;
  perform pg_temp.rec('you cannot remind yourself (no other member)', pg_temp.try('select public.send_task_reminder(''' || pt || ''', ''me'')') = 'no_partner');
  -- reminders only for shared tasks
  perform pg_temp.as_user(a);
  other := pg_temp.val('insert into public.tasks (workspace_id, kind, title, created_by, task_date) values (''' || w1 || ''', ''daily'', ''Personal daily'', ''' || a || ''', ''2030-01-01'') returning id')::uuid;
  perform pg_temp.rec('reminders are only for shared tasks', pg_temp.try('select public.send_task_reminder(''' || other || ''', ''hi'')') = 'not_shared_task');
  perform pg_temp.rec('completion approval only applies to shared tasks', pg_temp.try('select public.request_shared_completion(''' || other || ''')') = 'not_shared_task');

  -- daily limit
  perform pg_temp.as_admin();
  for i in 1..19 loop
    insert into public.notifications (user_id, workspace_id, kind, title, body, actor_id, subtype, dedupe_key, expires_at, created_at)
    values (b, w1, 'partner', 'x', 'y', a, 'reminder', 'limit-' || i, now() + interval '20 hours', now() - interval '4 hours');
  end loop;
  perform pg_temp.as_user(a);
  r := pg_temp.try('select public.send_task_reminder(''' || s2 || ''', ''one more'')');
  perform pg_temp.rec('at most 20 reminders per sender per 24 hours', r = 'daily_limit', r);
  perform pg_temp.as_admin();
  delete from public.notifications where dedupe_key like 'limit-%';

  -- ===================== APPROVAL =====================
  perform pg_temp.as_user(b);
  r := pg_temp.val('select public.review_shared_completion(''' || s1 || ''', true)::text');
  perform pg_temp.as_admin();
  perform pg_temp.rec('the other person can approve: the task is completed for both', (select shared_state = 'completed' and status = 'completed' and completed_at is not null from public.tasks where id = s1), r);
  perform pg_temp.rec('approval records requester, approver and time', (select completed_by = a and approved_by = b and approved_at is not null and completion_requested_by = a from public.tasks where id = s1));
  perform pg_temp.rec('the history row is approved by the reviewer', exists (select 1 from public.shared_task_completions where task_id = s1 and outcome = 'approved' and requested_by = a and reviewed_by = b and reviewed_at is not null));
  perform pg_temp.rec('both people get a completion notification', exists (select 1 from public.notifications where user_id = a and subtype = 'completion_approved' and title = 'Shared task completed') and exists (select 1 from public.notifications where user_id = b and subtype = 'completion_approved' and title = 'Shared task completed'));
  perform pg_temp.as_user(a);
  perform pg_temp.rec('the requester sees it completed', pg_temp.val('select status from public.tasks where id = ''' || s1 || '''') = 'completed');
  perform pg_temp.as_user(b);
  perform pg_temp.rec('the approver sees it completed (same state)', pg_temp.val('select shared_state from public.tasks where id = ''' || s1 || '''') = 'completed');
  m := pg_temp.try('select public.review_shared_completion(''' || s1 || ''', false)');
  perform pg_temp.rec('a late rejection after approval is refused (no pending request)', m = 'no_pending_request', m);
  m := pg_temp.try('select public.review_shared_completion(''' || s1 || ''', true)');
  perform pg_temp.rec('approving twice is refused', m = 'no_pending_request', m);
  m := pg_temp.try('select public.request_shared_completion(''' || s1 || ''')');
  perform pg_temp.rec('a completed task cannot receive a new completion request', m = 'task_completed', m);
  m := pg_temp.try('select public.send_task_reminder(''' || s1 || ''', ''nudge'')');
  perform pg_temp.rec('a completed task cannot receive reminders', m = 'task_completed', m);
  perform pg_temp.as_user(d);
  perform pg_temp.rec('another workspace cannot reopen', pg_temp.try('select public.reopen_shared_task(''' || s1 || ''')') = 'not_found');
  perform pg_temp.as_user(a);
  perform pg_temp.rec('only a completed task can be reopened', pg_temp.try('select public.reopen_shared_task(''' || s2 || ''')') = 'not_completed');
  r := pg_temp.val('select public.reopen_shared_task(''' || s1 || ''')::text');
  perform pg_temp.as_admin();
  perform pg_temp.rec('reopening is explicit, returns the task to active and is recorded', (select shared_state = 'active' and status = 'open' and completed_at is null and approved_by is null from public.tasks where id = s1)
    and exists (select 1 from public.shared_task_completions where task_id = s1 and outcome = 'reopened' and reviewed_by = a), r);
  perform pg_temp.rec('the earlier approval stays in the history after reopening', exists (select 1 from public.shared_task_completions where task_id = s1 and outcome = 'approved'));

  -- ===================== REJECTION =====================
  perform pg_temp.as_user(b);
  perform pg_temp.val('select public.request_shared_completion(''' || s1 || ''')::text');
  perform pg_temp.as_user(a);
  r := pg_temp.val('select public.review_shared_completion(''' || s1 || ''', false)::text');
  perform pg_temp.as_admin();
  perform pg_temp.rec('rejection returns the task to active (not completed)', (select shared_state = 'active' and status = 'open' and completed_at is null and completion_requested_by is null and rejected_by = a and rejected_at is not null from public.tasks where id = s1), r);
  perform pg_temp.rec('the rejection is kept in the history with reviewer and time', exists (select 1 from public.shared_task_completions where task_id = s1 and outcome = 'rejected' and requested_by = b and reviewed_by = a and reviewed_at is not null));
  perform pg_temp.rec('the original requester is notified of the rejection', exists (select 1 from public.notifications where user_id = b and subtype = 'completion_rejected' and body like '%Plan the weekend trip%'));
  perform pg_temp.rec('nobody else is notified of the rejection', not exists (select 1 from public.notifications where user_id = a and subtype = 'completion_rejected'));
  perform pg_temp.as_user(b);
  m := pg_temp.try('select public.review_shared_completion(''' || s1 || ''', true)');
  perform pg_temp.rec('a late approval after rejection is refused', m = 'no_pending_request', m);
  perform pg_temp.as_user(a);
  r := pg_temp.try('select public.request_shared_completion(''' || s1 || ''')');
  perform pg_temp.rec('after a rejection either person can request completion again', r = 'ok', r);
  perform pg_temp.as_admin();
  perform pg_temp.rec('the history now holds the rejected request AND the new pending one', (select count(*) from public.shared_task_completions where task_id = s1 and outcome in ('rejected', 'pending')) = 2);
  perform pg_temp.as_user(b);
  perform pg_temp.val('select public.review_shared_completion(''' || s1 || ''', true)::text');
  perform pg_temp.as_admin();
  perform pg_temp.rec('the second request can then be approved', (select shared_state from public.tasks where id = s1) = 'completed');

  -- ===================== DELETE invalidates a pending request =====================
  perform pg_temp.as_user(a);
  perform pg_temp.val('select public.request_shared_completion(''' || s2 || ''')::text');
  perform pg_temp.as_user(b);
  perform pg_temp.try('delete from public.tasks where id = ''' || s2 || '''');
  m := pg_temp.try('select public.review_shared_completion(''' || s2 || ''', true)');
  perform pg_temp.rec('a deleted task cannot be approved', m = 'not_found', m);
  m := pg_temp.try('select public.send_task_reminder(''' || s2 || ''', ''hi'')');
  perform pg_temp.rec('a deleted task cannot receive reminders', m = 'not_found', m);
  perform pg_temp.as_admin();
  perform pg_temp.rec('deleting the task voids its pending request', not exists (select 1 from public.shared_task_completions where task_id = s2));

  -- ===================== NOTIFICATION PREFERENCES =====================
  perform pg_temp.as_user(b);
  perform pg_temp.try('insert into public.notification_preferences (user_id, partner) values (''' || b || ''', false)');
  perform pg_temp.as_user(a);
  s3 := pg_temp.val('insert into public.tasks (workspace_id, kind, title, created_by, task_date) values (''' || w1 || ''', ''shared'', ''Muted partner test'', ''' || a || ''', ''2030-01-01'') returning id')::uuid;
  r := pg_temp.val('select public.send_task_reminder(''' || s3 || ''', ''hello'')::text');
  perform pg_temp.rec('a muted partner receives no reminder (sender told nothing was delivered)', r like '%false%' and not exists (select 1 from public.notifications where user_id = b and task_id = s3), r);
  perform pg_temp.val('select public.request_shared_completion(''' || s3 || ''')::text');
  perform pg_temp.as_admin();
  perform pg_temp.rec('a muted partner gets no completion-request notification, but the state still changes', not exists (select 1 from public.notifications where user_id = b and task_id = s3) and (select shared_state from public.tasks where id = s3) = 'awaiting_approval');
  perform pg_temp.rec('a muted person still sees the request in the task itself', true);

  -- ===================== RETENTION (24 hours) =====================
  s4 := s3;
  perform pg_temp.as_user(a);
  s5 := pg_temp.val('insert into public.tasks (workspace_id, kind, title, created_by, task_date) values (''' || w1 || ''', ''shared'', ''Retention'', ''' || a || ''', ''2030-01-01'') returning id')::uuid;
  perform pg_temp.as_admin();
  delete from public.notification_preferences where user_id = b;
  perform pg_temp.as_user(a);
  perform pg_temp.val('select public.send_task_reminder(''' || s5 || ''', ''Keep this for a day'')::text');
  perform pg_temp.as_admin();
  perform pg_temp.as_user(b);
  perform pg_temp.rec('a reminder is readable before it expires', pg_temp.val('select count(*) from public.notifications where body like ''%Keep this for a day%''') = '1');
  perform pg_temp.as_admin();
  update public.notifications set expires_at = now() - interval '1 second' where body like '%Keep this for a day%';
  perform pg_temp.as_user(b);
  perform pg_temp.rec('after 24 hours the reminder is invisible immediately (RLS), before cleanup runs', pg_temp.val('select count(*) from public.notifications where body like ''%Keep this for a day%''') = '0');
  perform pg_temp.as_admin();
  perform pg_temp.rec('the expired row still physically exists until cleanup', exists (select 1 from public.notifications where body like '%Keep this for a day%'));
  cnt := public.purge_expired_reminders();
  perform pg_temp.rec('cleanup deletes the expired reminder content', cnt >= 1 and not exists (select 1 from public.notifications where body like '%Keep this for a day%'));
  perform pg_temp.rec('cleanup keeps the shared task', exists (select 1 from public.tasks where id = s5));
  perform pg_temp.rec('cleanup keeps completion history and non-reminder notifications', exists (select 1 from public.shared_task_completions where task_id = s1 and outcome = 'approved') and exists (select 1 from public.notifications where subtype = 'completion_approved'));
  perform pg_temp.as_user(a);
  perform pg_temp.rec('clients cannot run the cleanup', pg_temp.try('select public.purge_expired_reminders()') <> 'ok');

  -- ===================== PERSONAL TASKS unchanged =====================
  perform pg_temp.as_user(a);
  r := pg_temp.try('update public.tasks set status = ''completed'' where id = ''' || other || '''');
  perform pg_temp.rec('personal tasks still complete directly with one record', r = 'ok' and pg_temp.val('select completed_by = ''' || a || ''' from public.tasks where id = ''' || other || '''') = 'true', r);
  perform pg_temp.as_user(d);
  perform pg_temp.rec('personal tasks stay invisible to other workspaces', pg_temp.val('select count(*) from public.tasks where id = ''' || other || '''') = '0');

  -- ===================== DEADLINE REMINDERS include shared tasks =====================
  perform pg_temp.as_user(a);
  s4 := pg_temp.val('insert into public.tasks (workspace_id, kind, title, created_by, task_date, due_at) values (''' || w1 || ''', ''shared'', ''Deadline shared'', ''' || a || ''', ''2030-03-01'', ''2030-03-01 10:00+00'') returning id')::uuid;
  perform pg_temp.as_admin();
  update public.tasks set reminders_from = timestamptz '2030-03-01 08:00+00' where id = s4;
  perform public.generate_notifications_for(a, timestamptz '2030-03-01 10:00+00' - interval '5 minutes' + interval '10 seconds');
  perform public.generate_notifications_for(b, timestamptz '2030-03-01 10:00+00' - interval '5 minutes' + interval '10 seconds');
  perform pg_temp.rec('a shared task with a deadline reminds BOTH people', exists (select 1 from public.notifications where user_id = a and task_id = s4 and kind = 'deadline') and exists (select 1 from public.notifications where user_id = b and task_id = s4 and kind = 'deadline'));
  perform pg_temp.rec('a shared task without a deadline never produces deadline reminders', not exists (select 1 from public.notifications where task_id = s3 and kind = 'deadline'));
end $$;

select n, case when passed then 'PASS' else 'FAIL' end as result, name, detail from test_results order by n;
select count(*) filter (where passed) as passed, count(*) filter (where not passed) as failed, count(*) as total from test_results;

rollback;
