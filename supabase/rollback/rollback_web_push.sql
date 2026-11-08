-- Removes Web Push (does not touch notifications history).
do $$ begin perform cron.unschedule('ourday-push-sweep'); exception when others then null; end $$;
drop trigger if exists notifications_push_after_insert on public.notifications;
drop function if exists public.notifications_push_trigger(), public.push_sweep(), public.push_dispatch(uuid);
drop table if exists public.push_config;
drop table if exists public.push_subscriptions;
drop index if exists public.notifications_push_pending_idx;
alter table public.notifications drop column if exists push_sent_at;
