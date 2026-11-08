-- OurDay · deadline reminder scheduling correctness.
-- BUG: the generator created every reminder whose instant fell in the last 30 minutes, so a task created 6 minutes
-- before its deadline immediately produced "30 minutes", "15 minutes" and "5 minutes" together.
-- FIX: remember when each deadline schedule began (tasks.reminders_from) and never create reminders scheduled before
-- it; shrink the outage grace window from 30 to 3 minutes. Nothing is deleted; existing notification rows are untouched.
-- Cancellation is inherent: reminders are created just in time from the CURRENT due_at/status, so editing a deadline
-- starts a new schedule (new dedupe key, new reminders_from) and completing/deleting a task stops all further ones.

alter table public.tasks add column reminders_from timestamptz not null default now();
-- existing tasks: schedule starts now, so nothing in the past is replayed after this migration

create or replace function public.tasks_reminder_epoch()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.reminders_from := now();
  elsif new.due_at is distinct from old.due_at or (new.status = 'open' and old.status <> 'open') then
    new.reminders_from := now();            -- deadline changed / task reopened: a brand-new schedule
  else
    new.reminders_from := old.reminders_from; -- clients can never move it
  end if;
  return new;
end $$;

create trigger tasks_reminder_epoch_trg before insert or update on public.tasks
  for each row execute function public.tasks_reminder_epoch();
revoke all on function public.tasks_reminder_epoch() from public, anon, authenticated;

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
    where t.workspace_id = ws and t.kind = 'deadline' and t.status = 'open' and t.due_at is not null
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


-- Safety net must not resurrect reminders for tasks that were completed/deleted/edited after the row was made.
create or replace function public.push_sweep()
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select n.id from public.notifications n
           where n.push_sent_at is null and n.created_at < now() - interval '1 minute' and n.created_at > now() - interval '15 minutes'
             and (n.kind <> 'deadline' or n.task_id is null or exists (select 1 from public.tasks t where t.id = n.task_id and t.status = 'open'))
           order by n.created_at limit 50 loop
    perform public.push_dispatch(r.id);
  end loop;
end $$;
revoke all on function public.push_sweep() from public, anon, authenticated;
