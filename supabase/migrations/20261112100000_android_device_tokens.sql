-- OurDay · native Android push registration (additive, backward compatible; PREPARED, NOT APPLIED).
-- The Android app registers its FCM device token here. Web Push (push_subscriptions) is untouched. Nothing sends to these
-- tokens yet: a sender needs a Firebase service account (a server secret), see android/ARCHITECTURE.md ("Native push").
-- Until this is applied the Android app skips registration quietly.

create table public.device_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  token        text not null unique check (char_length(token) between 20 and 4096),
  platform     text not null default 'android' check (platform in ('android')),
  -- Which route delivers to this device. One device = one route, so Web Push and FCM never both notify the same phone.
  route        text not null default 'fcm' check (route in ('fcm', 'webpush')),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index device_tokens_user_idx on public.device_tokens (user_id);

alter table public.device_tokens enable row level security;
revoke all on table public.device_tokens from public, anon, authenticated;
grant select, insert, update, delete on public.device_tokens to authenticated;
create policy device_tokens_select on public.device_tokens for select to authenticated using (user_id = (select auth.uid()));
create policy device_tokens_insert on public.device_tokens for insert to authenticated with check (user_id = (select auth.uid()));
create policy device_tokens_update on public.device_tokens for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy device_tokens_delete on public.device_tokens for delete to authenticated using (user_id = (select auth.uid()));

-- The send-push Edge Function reads a user's tokens and removes dead ones (it connects as service_role).
grant select, delete on public.device_tokens to service_role;
grant update (last_seen_at) on public.device_tokens to service_role;
