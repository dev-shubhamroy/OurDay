-- Removes the Inspiration Library (deletes every saved quote).
drop table if exists public.inspiration_quotes;
drop function if exists public.inspiration_quotes_guard();
