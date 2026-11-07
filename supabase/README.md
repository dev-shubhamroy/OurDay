# OurDay · Supabase database

SQL for the authentication / two-person-workspace milestone. **Nothing here is applied automatically** —
you review it and run it yourself. It only creates new objects (it does not touch `auth.users` rows or any existing data).

## Files
| File | What it does |
|---|---|
| `migrations/20261108100000_core_schema.sql` | `profiles`, `workspaces`, `workspace_members`, `workspace_invitations`, constraints, indexes, profile-on-signup trigger, two-member limit trigger |
| `migrations/20261108100100_workspace_functions.sql` | `create_workspace`, `create_invitation`, `revoke_invitation`, `get_invitation_status`, `accept_invitation` + two helpers used by policies |
| `migrations/20261108100200_rls_and_grants.sql` | Row Level Security, policies, minimum table/function privileges |
| `migrations/20261108110000_tasks_habits.sql` | `tasks`, `habits`, `habit_logs`, guards, RLS, Realtime publication |
| `tests/workspace_security.sql`, `tests/tasks_habits_security.sql` | 49 + 49 PASS/FAIL checks; create throw-away users and **roll everything back** |
| `tests/local/` | `npm install && npm test` runs all migrations + tests in an in-memory Postgres (no keys needed) |
| `rollback/rollback_workspace_auth.sql` | Destructive undo (drops these tables). Only if you want to start over |

## Apply (pick one)
**A. SQL Editor (simplest):** Supabase Dashboard → SQL Editor → New query. Paste and run the three migration files **in order**.
**B. Supabase CLI:** `supabase link --project-ref <ref>` then `supabase db push`. (CLI is not installed here; you only need it for this option.)

Then run `tests/workspace_security.sql` and `tests/tasks_habits_security.sql` the same way. Each should show 49 rows, all `PASS`, and `failed = 0`.

**Realtime:** migration 4 adds the tables to the `supabase_realtime` publication. Check Dashboard → Database → Replication that `tasks`, `habits`, `habit_logs`, `workspace_members` and `profiles` are listed under `supabase_realtime`. If you applied an earlier version of migration 4, tell me — I'll write a small forward migration rather than editing it.
If the test's first `insert into auth.users` errors in your project, tell me the message and I'll adapt it.

## What the schema guarantees (enforced by the database, not the UI)
- One workspace per user (`unique(user_id)`), at most two members (trigger that locks the workspace row), one owner (partial unique index).
- Invitations store only a SHA-256 hash; clients cannot read the table. Codes are 24 random bytes (32 URL-safe characters), single-use, 7-day expiry, one live invitation per workspace (generating a new one revokes the old one).
- Clients can read only their own workspace data and update only their own display name. Membership, roles, workspaces and invitations change only through the functions above.
- Functions raise short codes only: `not_authenticated`, `already_in_workspace`, `not_owner`, `invalid_invitation`, `invitation_expired`, `invitation_used`, `own_invitation`, `workspace_full`, `invalid_name`.

## Manual concurrency check (optional, needs two sessions)
Two people accepting the same code at the same instant is protected by row locks (workspace, then invitation) plus the member-limit trigger,
but a single SQL script can't race itself. To see it: create a workspace with one member, generate a code, then in two SQL Editor tabs impersonating two
different new users run `select public.accept_invitation('<code>')` at the same time. Exactly one succeeds; the other gets `invitation_used` or `workspace_full`.

## Dashboard settings you need (for the next milestone)
1. **Authentication → Sign In / Providers → Email:** enabled, **"Confirm email" OFF** (approved: no mandatory verification). Leave magic links / OTP unused.
2. **Authentication → URL Configuration:** Site URL `http://localhost:5180` for now (your Vercel URL later). Redirect URLs: `http://localhost:5180/**` and later `https://<your-app>.vercel.app/**` (password-reset links return here).
3. **Authentication → Email templates → Reset password:** keep `{{ .ConfirmationURL }}` (I can supply wording).
4. **Project Settings → API:** copy the Project URL and the **publishable (anon)** key into `frontend/.env.local`. Never use or share the `service_role` key.
5. *Optional hardening once both of you have accounts:* Authentication → Sign In / Providers → turn **"Allow new users to sign up" OFF**. With no email verification, anyone who finds the URL could otherwise create an account (they still could not see your data or join your workspace without an invitation).
6. Emails: with verification off, sign-up sends no email. Only password-reset emails are sent; Supabase's built-in sender is rate-limited and for light testing, which is plenty for two people. Custom SMTP is optional.
