-- Web Push fix: the send-push Edge Function connects as service_role, which in this project has NO privileges on
-- public tables (verified: has_table_privilege = false everywhere), so its first query failed with
-- "permission denied for table notifications". Grant only what the function actually does. Clients are unaffected.
grant usage on schema public to service_role;
grant select on public.notifications, public.notification_preferences to service_role;
grant update (push_sent_at) on public.notifications to service_role;
grant select, delete on public.push_subscriptions to service_role;
grant update (last_success_at) on public.push_subscriptions to service_role;
