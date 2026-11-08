-- OurDay · Web Push (Android Chrome / installed PWA).
-- Every row the notification system writes is forwarded, exactly once, to the recipient's registered devices by the
-- `send-push` Edge Function. Nothing here changes how notifications are generated, deduplicated or shown in history.
--
--   push_subscriptions : one row per browser/device that turned notifications on (owned by that user, RLS).
--   notifications.push_sent_at : set by the Edge Function when it claims a row (the duplicate guard).
--   push_config        : single private row {function_url, secret}; unreadable by clients. Set once after deploying
--                        the function (see supabase/README.md). Without it the triggers do nothing.

do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net not available (%); enable it in Dashboard -> Database -> Extensions', sqlerrm;
end $$;

create table public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  endpoint        text not null unique check (char_length(endpoint) between 10 and 1000),
  p256dh          text not null check (char_length(p256dh) between 10 and 200),
  auth            text not null check (char_length(auth) between 4 and 100),
  user_agent      text check (char_length(user_agent) <= 300),
  created_at      timestamptz not null default now(),
  last_success_at timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
create policy push_subscriptions_select on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy push_subscriptions_insert on public.push_subscriptions for insert to authenticated with check (user_id = (select auth.uid()));
create policy push_subscriptions_update on public.push_subscriptions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy push_subscriptions_delete on public.push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));

alter table public.notifications add column push_sent_at timestamptz;
create index notifications_push_pending_idx on public.notifications (created_at) where push_sent_at is null;

create table public.push_config (
  id           boolean primary key default true check (id),
  function_url text not null,
  secret       text not null
);
alter table public.push_config enable row level security; -- no policies: invisible to clients
revoke all on table public.push_config from public, anon, authenticated;

-- Asks the Edge Function to deliver one notification (fire-and-forget; failures never block the insert).
create or replace function public.push_dispatch(p_id uuid)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare c public.push_config;
begin
  select * into c from public.push_config limit 1;
  if not found then return; end if;
  perform net.http_post(
    url := c.function_url,
    body := jsonb_build_object('id', p_id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', c.secret),
    timeout_milliseconds := 5000);
exception when others then
  raise warning 'push_dispatch failed: %', sqlerrm;
end $$;

create or replace function public.notifications_push_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.push_dispatch(new.id);
  return new;
end $$;

create trigger notifications_push_after_insert after insert on public.notifications
  for each row execute function public.notifications_push_trigger();

-- Safety net: re-dispatch anything not pushed after a minute (function was down, network hiccup). Only the last
-- 15 minutes, so a long outage never replays stale reminders.
create or replace function public.push_sweep()
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from public.notifications
           where push_sent_at is null and created_at < now() - interval '1 minute' and created_at > now() - interval '15 minutes'
           order by created_at limit 50 loop
    perform public.push_dispatch(r.id);
  end loop;
end $$;

revoke all on function public.push_dispatch(uuid), public.notifications_push_trigger(), public.push_sweep() from public, anon, authenticated;

do $$
begin
  perform cron.schedule('ourday-push-sweep', '* * * * *', 'select public.push_sweep()');
exception when others then
  raise notice 'pg_cron not available (%); push relies on the insert trigger only', sqlerrm;
end $$;
