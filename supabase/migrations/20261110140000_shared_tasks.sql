-- OurDay · Shared Tasks (additive; no existing row is changed).
--
-- A shared task is a task of kind 'shared': visible to both members of the workspace, with an OPTIONAL deadline and
-- ONE shared completion that needs the other person's approval:
--     active --request--> awaiting_approval --approve--> completed        (reopen: completed --> active)
--                                  `--reject--> active
-- Everything that moves a shared task between those states runs through the SECURITY DEFINER functions below, which
-- lock the task row (so simultaneous attempts are serialised), check membership and "not your own request", write an
-- auditable history row and notify the right people. Clients cannot change the state columns directly: tasks_guard
-- rejects it unless it comes from those functions.
--
-- Reminders are ordinary notification rows (subtype 'reminder') that expire after 24 hours: RLS hides them at once
-- and a cron job deletes them. No chat history, no separate messaging table.

-- ---------------------------------------------------------------------------
-- tasks: new kind + state columns
-- ---------------------------------------------------------------------------
alter table public.tasks drop constraint tasks_kind_check;
alter table public.tasks add constraint tasks_kind_check check (kind in ('daily', 'deadline', 'shared'));
alter table public.tasks drop constraint tasks_deadline_has_due_at;
alter table public.tasks add constraint tasks_deadline_has_due_at check (
  (kind = 'deadline' and due_at is not null) or (kind = 'daily' and due_at is null) or kind = 'shared');   -- a shared deadline is optional

alter table public.tasks
  add column shared_state            text check (shared_state in ('active', 'awaiting_approval', 'completed')),
  add column completion_requested_by uuid references public.profiles (id) on delete set null,
  add column completion_requested_at timestamptz,
  add column approved_by             uuid references public.profiles (id) on delete set null,
  add column approved_at             timestamptz,
  add column rejected_by             uuid references public.profiles (id) on delete set null,
  add column rejected_at             timestamptz;

alter table public.tasks add constraint tasks_shared_state_matches_kind check ((kind = 'shared') = (shared_state is not null));
alter table public.tasks add constraint tasks_shared_state_matches_status check (kind <> 'shared' or ((shared_state = 'completed') = (status = 'completed')));
alter table public.tasks add constraint tasks_only_shared_has_approval check (
  kind = 'shared' or (completion_requested_by is null and completion_requested_at is null and approved_by is null and approved_at is null and rejected_by is null and rejected_at is null));

-- ---------------------------------------------------------------------------
-- Completion history (audit trail). Written only by the functions below; members can read their workspace's rows.
-- ---------------------------------------------------------------------------
create table public.shared_task_completions (
  id             uuid primary key default gen_random_uuid(),
  task_id        uuid not null references public.tasks (id) on delete cascade,   -- deleting the task voids a pending request
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  requested_by   uuid not null references public.profiles (id) on delete cascade,
  requested_at   timestamptz not null default now(),
  previous_state text not null default 'active' check (previous_state in ('active', 'awaiting_approval', 'completed')),
  outcome        text not null default 'pending' check (outcome in ('pending', 'approved', 'rejected', 'reopened')),
  reviewed_by    uuid references public.profiles (id) on delete set null,
  reviewed_at    timestamptz,
  constraint stc_reviewed_consistent check ((outcome = 'pending') = (reviewed_at is null))
);
-- At most ONE unresolved request per task, enforced by the database.
create unique index shared_task_one_pending on public.shared_task_completions (task_id) where outcome = 'pending';
create index shared_task_completions_task_idx on public.shared_task_completions (task_id, requested_at desc);

alter table public.shared_task_completions enable row level security;
revoke all on table public.shared_task_completions from public, anon, authenticated;
grant select on public.shared_task_completions to authenticated;
create policy shared_task_completions_select on public.shared_task_completions for select to authenticated
  using (workspace_id = public.current_workspace_id());

-- ---------------------------------------------------------------------------
-- tasks_guard: same behaviour for personal tasks; shared tasks protect their state columns.
-- ---------------------------------------------------------------------------
create or replace function public.tasks_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  via_fn boolean := coalesce(current_setting('ourday.shared_rpc', true), '') = '1';
begin
  if tg_op = 'INSERT' then
    if new.kind = 'shared' then
      -- A shared task always starts active and unfinished, and both people are always notified about it.
      new.status := 'open'; new.shared_state := 'active';
      new.completed_at := null; new.completed_by := null;
      new.completion_requested_by := null; new.completion_requested_at := null;
      new.approved_by := null; new.approved_at := null; new.rejected_by := null; new.rejected_at := null;
      new.notify_second_user := true;
    elsif new.status = 'completed' then
      new.completed_at := now();
      new.completed_by := uid;
    else
      new.completed_at := null;
      new.completed_by := null;
    end if;
    return new;
  end if;

  if new.workspace_id <> old.workspace_id or new.created_by <> old.created_by
     or new.created_at <> old.created_at or new.kind <> old.kind then
    raise exception 'immutable_field' using errcode = 'P0001';
  end if;

  if new.kind = 'shared' then
    if not via_fn and (new.status is distinct from old.status or new.shared_state is distinct from old.shared_state
       or new.completed_at is distinct from old.completed_at or new.completed_by is distinct from old.completed_by
       or new.completion_requested_by is distinct from old.completion_requested_by or new.completion_requested_at is distinct from old.completion_requested_at
       or new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at
       or new.rejected_by is distinct from old.rejected_by or new.rejected_at is distinct from old.rejected_at) then
      raise exception 'use_shared_task_functions' using errcode = 'P0001';
    end if;
    new.notify_second_user := true;
    new.updated_at := now();
    return new;
  end if;

  if new.status = 'completed' and old.status <> 'completed' then
    new.completed_at := now();
    new.completed_by := uid;
  elsif new.status = 'open' then
    new.completed_at := null;
    new.completed_by := null;
  else
    -- already completed and stays completed: the single completion record is immutable
    new.completed_at := old.completed_at;
    new.completed_by := old.completed_by;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- notifications: subtype + expiry (reminder content lives 24 hours)
-- ---------------------------------------------------------------------------
alter table public.notifications
  add column subtype text check (subtype in ('reminder', 'completion_request', 'completion_approved', 'completion_rejected', 'shared_task')),
  add column expires_at timestamptz;
create index notifications_expires_idx on public.notifications (expires_at) where expires_at is not null;

-- Recipients only, and an expired reminder disappears for everyone the moment it expires (cleanup follows).
drop policy notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) and (expires_at is null or expires_at > now()));

create or replace function public.purge_expired_reminders()
returns integer language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  delete from public.notifications where expires_at is not null and expires_at <= now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.purge_expired_reminders() from public, anon, authenticated;
grant execute on function public.purge_expired_reminders() to service_role;

do $$
begin
  perform cron.schedule('ourday-reminder-expiry', '*/10 * * * *', 'select public.purge_expired_reminders()');
exception when others then
  raise notice 'pg_cron not available (%); expired reminders are hidden by RLS but not deleted', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- Shared-task functions (the only way to change a shared task's state)
-- ---------------------------------------------------------------------------
-- Locks the task, proves the caller belongs to its workspace and that it is a shared task.
create or replace function public.shared_task_lock(p_task uuid)
returns public.tasks language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); t public.tasks;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into t from public.tasks where id = p_task for update;
  if not found or t.workspace_id is distinct from public.current_workspace_id() then raise exception 'not_found' using errcode = 'P0001'; end if;
  if t.kind <> 'shared' then raise exception 'not_shared_task' using errcode = 'P0001'; end if;
  perform set_config('ourday.shared_rpc', '1', true);   -- lets tasks_guard accept the state change below (this transaction only)
  return t;
end $$;

create or replace function public.shared_notify(p_to uuid, p_ws uuid, p_title text, p_body text, p_task uuid, p_actor uuid, p_subtype text, p_key text, p_ttl interval default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_to is null or not public.notif_pref(p_to, 'partner') then return; end if;
  insert into public.notifications (user_id, workspace_id, kind, title, body, task_id, actor_id, subtype, dedupe_key, occurred_at, expires_at)
  values (p_to, p_ws, 'partner', left(p_title, 200), left(p_body, 600), p_task, p_actor, p_subtype, p_key, now(), case when p_ttl is null then null else now() + p_ttl end)
  on conflict (user_id, dedupe_key) do nothing;
end $$;

create or replace function public.request_shared_completion(p_task uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); t public.tasks; h uuid;
begin
  t := public.shared_task_lock(p_task);
  if t.shared_state = 'completed' then raise exception 'task_completed' using errcode = 'P0001'; end if;
  if t.shared_state = 'awaiting_approval' then raise exception 'already_pending' using errcode = 'P0001'; end if;
  insert into public.shared_task_completions (task_id, workspace_id, requested_by, previous_state)
  values (t.id, t.workspace_id, uid, t.shared_state) returning id into h;
  update public.tasks set shared_state = 'awaiting_approval', completion_requested_by = uid, completion_requested_at = now(),
         rejected_by = null, rejected_at = null where id = t.id;
  perform public.shared_notify(public.notif_other_member(t.workspace_id, uid), t.workspace_id,
    public.notif_first_name(uid) || ' says this task is done', '“' || t.title || '”', t.id, uid, 'completion_request', 'sc:req:' || h);
  return jsonb_build_object('state', 'awaiting_approval', 'request_id', h);
end $$;

create or replace function public.review_shared_completion(p_task uuid, p_approve boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); t public.tasks; h public.shared_task_completions; requester uuid;
begin
  t := public.shared_task_lock(p_task);
  if t.shared_state <> 'awaiting_approval' then raise exception 'no_pending_request' using errcode = 'P0001'; end if;
  select * into h from public.shared_task_completions where task_id = t.id and outcome = 'pending' for update;
  if not found then raise exception 'no_pending_request' using errcode = 'P0001'; end if;
  requester := h.requested_by;
  if requester = uid then raise exception 'cannot_review_own_request' using errcode = 'P0001'; end if;

  if p_approve then
    update public.shared_task_completions set outcome = 'approved', reviewed_by = uid, reviewed_at = now() where id = h.id;
    update public.tasks set shared_state = 'completed', status = 'completed', completed_at = now(), completed_by = requester,
           approved_by = uid, approved_at = now() where id = t.id;
    perform public.shared_notify(requester, t.workspace_id, 'Shared task completed',
      '“' || t.title || E'”\n' || public.notif_first_name(uid) || ' approved your request', t.id, uid, 'completion_approved', 'sc:ok:' || h.id || ':' || requester);
    perform public.shared_notify(uid, t.workspace_id, 'Shared task completed',
      '“' || t.title || E'”\nYou approved ' || public.notif_first_name(requester) || '’s request', t.id, uid, 'completion_approved', 'sc:ok:' || h.id || ':' || uid);
    return jsonb_build_object('state', 'completed');
  end if;

  update public.shared_task_completions set outcome = 'rejected', reviewed_by = uid, reviewed_at = now() where id = h.id;
  update public.tasks set shared_state = 'active', completion_requested_by = null, completion_requested_at = null,
         rejected_by = uid, rejected_at = now() where id = t.id;
  perform public.shared_notify(requester, t.workspace_id, public.notif_first_name(uid) || ' didn’t approve completion',
    '“' || t.title || '” is still active', t.id, uid, 'completion_rejected', 'sc:no:' || h.id);
  return jsonb_build_object('state', 'active');
end $$;

-- Explicit reopen of a completed shared task: either member may do it; it is recorded in the history.
create or replace function public.reopen_shared_task(p_task uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); t public.tasks;
begin
  t := public.shared_task_lock(p_task);
  if t.shared_state <> 'completed' then raise exception 'not_completed' using errcode = 'P0001'; end if;
  insert into public.shared_task_completions (task_id, workspace_id, requested_by, previous_state, outcome, reviewed_by, reviewed_at)
  values (t.id, t.workspace_id, uid, 'completed', 'reopened', uid, now());
  update public.tasks set shared_state = 'active', status = 'open', completed_at = null, completed_by = null,
         completion_requested_by = null, completion_requested_at = null, approved_by = null, approved_at = null where id = t.id;
  return jsonb_build_object('state', 'active');
end $$;

-- One-way reminder to the OTHER member. Cooldown 5 minutes per task and sender, at most 20 per sender per 24 hours.
create or replace function public.send_task_reminder(p_task uuid, p_message text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid()); t public.tasks; msg text := btrim(regexp_replace(coalesce(p_message, ''), '\s+', ' ', 'g')); rcpt uuid; last_at timestamptz; sent int;
begin
  t := public.shared_task_lock(p_task);            -- also serialises rapid double-taps on the same task
  if t.shared_state = 'completed' then raise exception 'task_completed' using errcode = 'P0001'; end if;
  if msg = '' then raise exception 'empty_message' using errcode = 'P0001'; end if;
  if char_length(msg) > 200 then raise exception 'message_too_long' using errcode = 'P0001'; end if;
  rcpt := public.notif_other_member(t.workspace_id, uid);
  if rcpt is null or rcpt = uid then raise exception 'no_partner' using errcode = 'P0001'; end if;

  select max(created_at) into last_at from public.notifications where actor_id = uid and task_id = t.id and subtype = 'reminder';
  if last_at is not null and last_at > now() - interval '5 minutes' then
    raise exception 'cooldown' using errcode = 'P0001', detail = ceil(extract(epoch from (last_at + interval '5 minutes' - now())))::text;
  end if;
  select count(*) into sent from public.notifications where actor_id = uid and subtype = 'reminder' and created_at > now() - interval '24 hours';
  if sent >= 20 then raise exception 'daily_limit' using errcode = 'P0001'; end if;

  if not public.notif_pref(rcpt, 'partner') then return jsonb_build_object('delivered', false); end if;   -- they muted partner notifications
  perform public.shared_notify(rcpt, t.workspace_id, public.notif_first_name(uid) || ' reminded you', '“' || msg || E'”\n' || t.title,
    t.id, uid, 'reminder', 'rm:' || t.id || ':' || uid || ':' || gen_random_uuid(), interval '24 hours');
  return jsonb_build_object('delivered', true);
end $$;

revoke all on function public.shared_task_lock(uuid), public.shared_notify(uuid, uuid, text, text, uuid, uuid, text, text, interval) from public, anon, authenticated;
revoke all on function public.request_shared_completion(uuid), public.review_shared_completion(uuid, boolean),
  public.reopen_shared_task(uuid), public.send_task_reminder(uuid, text) from public, anon;
grant execute on function public.request_shared_completion(uuid), public.review_shared_completion(uuid, boolean),
  public.reopen_shared_task(uuid), public.send_task_reminder(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Deadline reminders also cover shared tasks that have a deadline (same rules as migration 8).
-- ---------------------------------------------------------------------------
create or replace function public.generate_notifications_for(p_user uuid, p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws uuid;
  tz text;
  n int := 0;
  c int;
  local_now timestamp;
  local_day date;
begin
  select m.workspace_id into ws from public.workspace_members m where m.user_id = p_user limit 1;
  if ws is null or not public.notif_pref(p_user, 'master') then return 0; end if;
  tz := public.notif_tz(p_user);

  -- Deadline reminders: 24h, 12h, 6h, 3h, 2h, 1h, 30m, 15m, 5m and the exact deadline.
  -- A reminder is created only when ALL hold: its scheduled instant has arrived, it is not older than a
  -- 3 minute grace (cron runs every minute; no back-filling after an outage), it is not earlier than the moment
  -- this deadline's schedule was set (tasks.reminders_from: task created, deadline edited or task reopened, so
  -- intervals already in the past at that moment are skipped, never "caught up"), the task is still OPEN, and
  -- (except the exact-deadline reminder) the deadline has not passed.
  if public.notif_pref(p_user, 'deadlines') then
    insert into public.notifications (user_id, workspace_id, kind, title, body, task_id, actor_id, dedupe_key, occurred_at)
    select p_user, ws, 'deadline',
           case when iv.secs = 0 then 'Deadline now' else 'Due in ' || iv.label end,
           '“' || t.title || '”'
             || case when t.created_by <> p_user then ' (' || public.notif_first_name(t.created_by) || '’s)' else '' end
             || case when iv.secs = 0 then ' is due now.'
                     else ' is due at ' || to_char(t.due_at at time zone tz, 'FMHH12:MI AM') || '.' end,
           t.id, t.created_by,
           'dl:' || t.id || ':' || extract(epoch from t.due_at)::bigint || ':' || iv.secs,
           t.due_at - make_interval(secs => iv.secs)
    from public.tasks t
    cross join (values (86400, '24 hours'), (43200, '12 hours'), (21600, '6 hours'), (10800, '3 hours'), (7200, '2 hours'),
                       (3600, '1 hour'), (1800, '30 minutes'), (900, '15 minutes'), (300, '5 minutes'), (0, '')) as iv (secs, label)
    where t.workspace_id = ws and t.kind in ('deadline', 'shared') and t.status = 'open' and t.due_at is not null
      and (t.created_by = p_user or t.notify_second_user)
      and t.due_at - make_interval(secs => iv.secs) <= p_now
      and t.due_at - make_interval(secs => iv.secs) > p_now - interval '3 minutes'
      and t.due_at - make_interval(secs => iv.secs) >= t.reminders_from
      and (iv.secs = 0 or t.due_at > p_now)
    on conflict (user_id, dedupe_key) do nothing;
    get diagnostics c = row_count; n := n + c;
  end if;

  -- Habit check-in at 9:30 PM in the person's timezone: scheduled, unpaused, started, theirs, not yet logged.
  if public.notif_pref(p_user, 'habits') then
    local_now := p_now at time zone tz;
    local_day := local_now::date;
    if local_now::time >= time '21:30' then
      insert into public.notifications (user_id, workspace_id, kind, title, body, habit_id, dedupe_key, occurred_at)
      select p_user, ws, 'habit', 'Habit check-in', 'Did you complete “' || h.title || '” today?', h.id,
             'hb:' || h.id || ':' || local_day, (local_day + time '21:30') at time zone tz
      from public.habits h
      where h.workspace_id = ws and not h.paused and h.start_date <= local_day
        and (h.schedule_days is null or extract(dow from local_day)::smallint = any (h.schedule_days))
        and ((h.is_shared and exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = p_user))
             or (not h.is_shared and h.owner_id = p_user))
        and not exists (select 1 from public.habit_logs l where l.habit_id = h.id and l.user_id = p_user and l.day = local_day)
      on conflict (user_id, dedupe_key) do nothing;
      get diagnostics c = row_count; n := n + c;
    end if;
  end if;
  return n;
end;
$$;



-- Partner-activity trigger: shared tasks are handled above, everything else is unchanged.
create or replace function public.notify_partner_task()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor uuid; rcpt uuid; kind_word text;
begin
  kind_word := case new.kind when 'deadline' then 'deadline' else 'task' end;
  -- Shared tasks have their own notifications (shared_notify / the completion functions).
  if new.kind = 'shared' then
    if tg_op = 'INSERT' then
      rcpt := public.notif_other_member(new.workspace_id, new.created_by);
      if rcpt is not null and public.notif_pref(rcpt, 'partner') then
        insert into public.notifications (user_id, workspace_id, kind, title, body, task_id, actor_id, subtype, dedupe_key, occurred_at)
        values (rcpt, new.workspace_id, 'partner', public.notif_first_name(new.created_by) || ' added a shared task', '“' || new.title || '”', new.id, new.created_by, 'shared_task', 'pa:shared:' || new.id || ':new', now())
        on conflict (user_id, dedupe_key) do nothing;
      end if;
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    actor := new.created_by;
    rcpt := public.notif_other_member(new.workspace_id, actor);
    if rcpt is null or not new.notify_second_user or not public.notif_pref(rcpt, 'partner') then return new; end if;
    insert into public.notifications (user_id, workspace_id, kind, title, body, task_id, actor_id, dedupe_key, occurred_at)
    values (rcpt, new.workspace_id, 'partner', public.notif_first_name(actor) || ' shared a ' || kind_word || ' with you',
            '“' || new.title || '”', new.id, actor, 'pa:task:' || new.id || ':new', now())
    on conflict (user_id, dedupe_key) do nothing;
  elsif new.status = 'completed' and old.status = 'open' then
    actor := new.completed_by;
    if actor is null then return new; end if;
    rcpt := public.notif_other_member(new.workspace_id, actor);
    if rcpt is null or not public.notif_pref(rcpt, 'partner') then return new; end if;
    if new.created_by = rcpt or (new.created_by = actor and new.notify_second_user) then
      insert into public.notifications (user_id, workspace_id, kind, title, body, task_id, actor_id, dedupe_key, occurred_at)
      values (rcpt, new.workspace_id, 'partner', public.notif_first_name(actor) || ' completed a ' || kind_word,
              '“' || new.title || '”', new.id, actor, 'pa:task:' || new.id || ':completed:' || extract(epoch from new.completed_at)::bigint, now())
      on conflict (user_id, dedupe_key) do nothing;
    end if;
  end if;
  return new;
end $$;

