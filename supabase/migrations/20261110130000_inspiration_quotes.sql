-- OurDay · Inspiration Library: each person's own saved quotes, shown by RANA in their briefings.
-- PRIVATE per person: only the owner can read or change their rows (the partner cannot see them). No new auth system;
-- the web app and the Mac companion both use the signed-in user's own Supabase session, so RLS applies to both.
-- Not applied to production automatically.

create table public.inspiration_quotes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  text       text not null check (char_length(btrim(text)) between 1 and 500),
  author     text check (author is null or char_length(btrim(author)) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index inspiration_quotes_user_idx on public.inspiration_quotes (user_id, created_at);

create trigger inspiration_quotes_set_updated_at before update on public.inspiration_quotes
  for each row execute function public.set_updated_at();

-- Ownership can never be re-assigned, and a library is capped so it stays a library, not a dump.
create or replace function public.inspiration_quotes_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.text := btrim(new.text);
  new.author := nullif(btrim(coalesce(new.author, '')), '');
  if tg_op = 'INSERT' then
    if (select count(*) from public.inspiration_quotes where user_id = new.user_id) >= 200 then
      raise exception 'quote_limit_reached' using errcode = 'check_violation';
    end if;
  elsif new.user_id <> old.user_id then
    raise exception 'immutable_owner' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger inspiration_quotes_guard_trg before insert or update on public.inspiration_quotes
  for each row execute function public.inspiration_quotes_guard();
revoke all on function public.inspiration_quotes_guard() from public, anon, authenticated;

alter table public.inspiration_quotes enable row level security;
revoke all on table public.inspiration_quotes from public, anon, authenticated;
grant select, insert, update, delete on public.inspiration_quotes to authenticated;

create policy inspiration_quotes_select on public.inspiration_quotes for select to authenticated using (user_id = (select auth.uid()));
create policy inspiration_quotes_insert on public.inspiration_quotes for insert to authenticated with check (user_id = (select auth.uid()));
create policy inspiration_quotes_update on public.inspiration_quotes for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy inspiration_quotes_delete on public.inspiration_quotes for delete to authenticated using (user_id = (select auth.uid()));

-- Realtime: edits on one device appear on the others.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inspiration_quotes') then
    alter publication supabase_realtime add table public.inspiration_quotes;
  end if;
end $$;
