-- OurDay · Migration 4 · Tasks, habits and habit logs (forward migration; earlier migrations are untouched)
-- Shared workspace data. Every table is scoped by workspace_id and protected by Row Level Security.
--
-- Approved product rules preserved:
--   * Tasks have ONE completion record (completed_at / completed_by), not one per member.
--   * Habits are personal (one owner) or shared (both members). Each person has an INDEPENDENT log row per day;
--     completing a shared habit for one person never touches the other person's row.
--   * Both members have full access to the workspace's tasks and habits. The notify flag never affects access.

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
create table public.tasks (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces (id) on delete cascade,
  kind               text not null check (kind in ('daily', 'deadline')),
  title              text not null check (char_length(btrim(title)) between 1 and 200),
  notes              text check (notes is null or char_length(notes) <= 1000),
  created_by         uuid not null references public.profiles (id) on delete cascade,
  notify_second_user boolean not null default false,
  -- Local calendar day chosen by the creator (daily: planned day; deadline: due day).
  task_date          date not null,
  -- Optional planned time of day for daily tasks (display only).
  planned_time       time,
  -- Exact deadline instant (timestamptz, so urgency uses the real moment in each viewer's time zone).
  due_at             timestamptz,
  status             text not null default 'open' check (status in ('open', 'completed')),
  completed_at       timestamptz,
  completed_by       uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint tasks_deadline_has_due_at check ((kind = 'deadline') = (due_at is not null)),
  constraint tasks_time_only_for_daily check (kind = 'daily' or planned_time is null),
  constraint tasks_completion_consistent check ((status = 'completed') = (completed_at is not null))
);

create index tasks_workspace_date_idx   on public.tasks (workspace_id, task_date);
create index tasks_workspace_status_idx on public.tasks (workspace_id, status);

-- Normalises completion server-side so clients cannot forge who completed a task or when.
create or replace function public.tasks_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    if new.status = 'completed' then
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

create trigger tasks_guard_trg
  before insert or update on public.tasks
  for each row execute function public.tasks_guard();

-- ---------------------------------------------------------------------------
-- habits
-- ---------------------------------------------------------------------------
create table public.habits (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces (id) on delete cascade,
  title              text not null check (char_length(btrim(title)) between 1 and 120),
  notes              text check (notes is null or char_length(notes) <= 1000),
  created_by         uuid not null references public.profiles (id) on delete cascade,
  -- Shared habits have no single owner; personal habits belong to exactly one member
  -- (a "partner's habit" is simply a personal habit whose owner is the other member).
  is_shared          boolean not null,
  owner_id           uuid references public.profiles (id) on delete cascade,
  -- NULL = every day; otherwise weekdays 0 (Sunday) .. 6 (Saturday). No time of day.
  schedule_days      smallint[],
  paused             boolean not null default false,
  start_date         date not null,
  notify_second_user boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint habits_owner_matches_scope check ((is_shared and owner_id is null) or (not is_shared and owner_id is not null)),
  constraint habits_schedule_valid check (
    schedule_days is null
    or (cardinality(schedule_days) between 1 and 7 and schedule_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[])
  )
);

create index habits_workspace_idx on public.habits (workspace_id);

create or replace function public.habits_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    -- You can create shared habits or personal habits for yourself.
    if not new.is_shared and uid is not null and new.owner_id <> uid then
      raise exception 'owner_must_be_creator' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if new.workspace_id <> old.workspace_id or new.created_by <> old.created_by or new.created_at <> old.created_at
     or new.is_shared <> old.is_shared or new.owner_id is distinct from old.owner_id or new.start_date <> old.start_date then
    raise exception 'immutable_field' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger habits_guard_trg
  before insert or update on public.habits
  for each row execute function public.habits_guard();

-- ---------------------------------------------------------------------------
-- habit_logs: one row per (habit, person, day). Independent per person by construction.
-- ---------------------------------------------------------------------------
create table public.habit_logs (
  habit_id     uuid not null references public.habits (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  day          date not null,
  status       text not null check (status in ('done', 'missed')),
  done_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (habit_id, user_id, day),
  constraint habit_logs_done_has_time check ((status = 'done') = (done_at is not null))
);

create index habit_logs_workspace_day_idx on public.habit_logs (workspace_id, day);

-- Derives workspace from the habit and verifies the person actually takes part in it.
create or replace function public.habit_logs_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  h public.habits%rowtype;
begin
  select * into h from public.habits where id = new.habit_id;
  if not found then
    raise exception 'invalid_habit' using errcode = 'P0001';
  end if;
  new.workspace_id := h.workspace_id;

  if not (
    (h.is_shared and exists (select 1 from public.workspace_members m where m.workspace_id = h.workspace_id and m.user_id = new.user_id))
    or (not h.is_shared and h.owner_id = new.user_id)
  ) then
    raise exception 'not_a_participant' using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' and (new.habit_id <> old.habit_id or new.user_id <> old.user_id or new.day <> old.day) then
    raise exception 'immutable_field' using errcode = 'P0001';
  end if;

  if new.status = 'done' then
    new.done_at := case when tg_op = 'UPDATE' and old.status = 'done' then old.done_at else now() end;
  else
    new.done_at := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger habit_logs_guard_trg
  before insert or update on public.habit_logs
  for each row execute function public.habit_logs_guard();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.tasks      enable row level security;
alter table public.habits     enable row level security;
alter table public.habit_logs enable row level security;

revoke all on table public.tasks, public.habits, public.habit_logs from public, anon, authenticated;
grant select, insert, update, delete on public.tasks      to authenticated;
grant select, insert, update, delete on public.habits     to authenticated;
grant select, insert, update, delete on public.habit_logs to authenticated;

revoke all on function public.tasks_guard()       from public, anon, authenticated;
revoke all on function public.habits_guard()      from public, anon, authenticated;
revoke all on function public.habit_logs_guard()  from public, anon, authenticated;

-- Tasks: both members have full access to the workspace's tasks.
create policy tasks_select on public.tasks for select to authenticated
  using (workspace_id = public.current_workspace_id());
create policy tasks_insert on public.tasks for insert to authenticated
  with check (workspace_id = public.current_workspace_id() and created_by = (select auth.uid()));
create policy tasks_update on public.tasks for update to authenticated
  using (workspace_id = public.current_workspace_id())
  with check (workspace_id = public.current_workspace_id());
create policy tasks_delete on public.tasks for delete to authenticated
  using (workspace_id = public.current_workspace_id());

-- Habits: both members see and manage every habit in the workspace (pause, edit, delete).
create policy habits_select on public.habits for select to authenticated
  using (workspace_id = public.current_workspace_id());
create policy habits_insert on public.habits for insert to authenticated
  with check (workspace_id = public.current_workspace_id() and created_by = (select auth.uid()));
create policy habits_update on public.habits for update to authenticated
  using (workspace_id = public.current_workspace_id())
  with check (workspace_id = public.current_workspace_id());
create policy habits_delete on public.habits for delete to authenticated
  using (workspace_id = public.current_workspace_id());

-- Habit logs: both members can SEE all logs (calendar shows both people), but you can only WRITE your own.
create policy habit_logs_select on public.habit_logs for select to authenticated
  using (workspace_id = public.current_workspace_id());
create policy habit_logs_insert on public.habit_logs for insert to authenticated
  with check (user_id = (select auth.uid()) and workspace_id = public.current_workspace_id());
create policy habit_logs_update on public.habit_logs for update to authenticated
  using (user_id = (select auth.uid()) and workspace_id = public.current_workspace_id())
  with check (user_id = (select auth.uid()) and workspace_id = public.current_workspace_id());
create policy habit_logs_delete on public.habit_logs for delete to authenticated
  using (user_id = (select auth.uid()) and workspace_id = public.current_workspace_id());

-- ---------------------------------------------------------------------------
-- Realtime: full old rows on update/delete, and publish the tables the app listens to.
-- (Realtime applies RLS to inserts/updates; the app also re-fetches on every event, so it never trusts payloads.)
-- ---------------------------------------------------------------------------
alter table public.tasks      replica identity full;
alter table public.habits     replica identity full;
alter table public.habit_logs replica identity full;

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['tasks', 'habits', 'habit_logs', 'workspace_members', 'profiles'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
