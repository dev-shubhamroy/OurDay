-- OurDay · Migration 1/3 · Core schema
-- Tables for accounts' profiles, the two-person workspace, memberships and invitations.
-- Non-destructive: only creates new objects. Safe to read before running.
-- Tasks, habits and notifications are NOT part of this milestone.

create extension if not exists pgcrypto with schema extensions;

-- Keeps updated_at current on tables that have it.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: one row per Supabase Auth user (display name only).
-- ---------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Creates the profile automatically when an account is registered.
-- The name comes from the sign-up metadata ({"name": "..."}), falling back to the email's local part.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  n text;
begin
  n := left(btrim(coalesce(new.raw_user_meta_data ->> 'name', '')), 60);
  if n = '' then
    n := left(coalesce(nullif(btrim(split_part(coalesce(new.email, ''), '@', 1)), ''), 'Me'), 60);
  end if;
  insert into public.profiles (id, name) values (new.id, n) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for any accounts that already exist.
insert into public.profiles (id, name)
select u.id,
       left(coalesce(nullif(btrim(u.raw_user_meta_data ->> 'name'), ''), nullif(btrim(split_part(coalesce(u.email, ''), '@', 1)), ''), 'Me'), 60)
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- workspaces
-- ---------------------------------------------------------------------------
create table public.workspaces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'Our workspace' check (char_length(btrim(name)) between 1 and 60),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger workspaces_set_updated_at
  before update on public.workspaces
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- workspace_members: exactly one workspace per user, at most two members, one owner.
-- ---------------------------------------------------------------------------
create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  role         text not null check (role in ('owner', 'partner')),
  joined_at    timestamptz not null default now(),
  primary key (workspace_id, user_id),
  constraint workspace_members_one_workspace_per_user unique (user_id)
);

-- One owner per workspace.
create unique index workspace_members_one_owner
  on public.workspace_members (workspace_id)
  where role = 'owner';

-- Database-level two-member limit, independent of any application code.
-- Locking the workspace row serialises concurrent joins: the second one waits, then sees the first.
create or replace function public.enforce_member_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c int;
begin
  perform 1 from public.workspaces where id = new.workspace_id for update;
  select count(*) into c from public.workspace_members where workspace_id = new.workspace_id;
  if c >= 2 then
    raise exception 'workspace_full' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger workspace_members_limit
  before insert on public.workspace_members
  for each row execute function public.enforce_member_limit();

-- ---------------------------------------------------------------------------
-- workspace_invitations: only the SHA-256 hash of the code is stored.
-- ---------------------------------------------------------------------------
create table public.workspace_invitations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_by   uuid not null references public.profiles (id) on delete cascade,
  code_hash    text not null unique,
  expires_at   timestamptz not null default (now() + interval '7 days'),
  accepted_by  uuid references public.profiles (id) on delete set null,
  accepted_at  timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),
  constraint workspace_invitations_not_both check (accepted_at is null or revoked_at is null)
);

-- At most one live (not accepted, not revoked) invitation per workspace.
create unique index workspace_invitations_one_active
  on public.workspace_invitations (workspace_id)
  where accepted_at is null and revoked_at is null;

create index workspace_invitations_workspace_idx on public.workspace_invitations (workspace_id);
