-- OurDay · Rollback for 20261109100000_notifications.sql. DESTRUCTIVE: drops notification history and preferences.
do $$ begin perform cron.unschedule('ourday-generate-notifications'); exception when others then null; end $$;
drop trigger if exists notify_partner_habit_upd on public.habit_logs;
drop trigger if exists notify_partner_habit_ins on public.habit_logs;
drop trigger if exists notify_partner_task_upd on public.tasks;
drop trigger if exists notify_partner_task_ins on public.tasks;
drop table if exists public.notifications;
drop table if exists public.notification_preferences;
drop function if exists public.generate_my_notifications();
drop function if exists public.generate_all_notifications();
drop function if exists public.generate_notifications_for(uuid, timestamptz);
drop function if exists public.notify_partner_habit();
drop function if exists public.notify_partner_task();
drop function if exists public.notif_first_name(uuid);
drop function if exists public.notif_pref(uuid, text);
drop function if exists public.notif_other_member(uuid, uuid);
drop function if exists public.notif_tz(uuid);
