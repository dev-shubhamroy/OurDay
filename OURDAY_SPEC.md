# OurDay — Product Specification

> Single source of truth for the product. Update this file whenever a feature is implemented or changed. Approved requirements are never changed silently.

## 1. Product overview & identity
- **Name:** OurDay
- **Tagline:** Plan together. Stay in sync.
- **What it is:** A premium, cross-device shared productivity space for two people (primarily couples) to manage daily responsibilities together: individual and shared tasks, deadlines, recurring habits, reminders, each other's task updates and shared progress.
- **Built-in assistant:** **RANA** — a deterministic daily briefing companion. RANA is *not* the app name and must not be renamed.

## 2. Task categories
| Category | Purpose | Key fields |
|---|---|---|
| Daily Task | Regular task planned for a day | title, planned date, optional time, notes, notify toggle |
| Deadline Task | Task with a hard due moment | title, deadline date + time, notes, notify toggle |
| Habit | Recurring practice, one occurrence per scheduled day, no time of day | name, owner(s), recurrence (every day / selected weekdays), notes |

## 3. RANA
- Friendly floating robotic companion: black metallic body, glowing blue expressive eyes, machine-like (never human), subtle float, small eye movements, restrained greeting/acknowledgement animations.
- **First screen of each day** is RANA's daily briefing, in this order: (1) today's deadlines by urgency, (2) today's daily tasks, (3) today's habits (separate section). Ends with a **Let's get started** action that opens the workspace.
- Also appears as a small floating companion in the workspace (bottom-right). While the page is scrolling it fades back so it never covers row details, and returns when scrolling stops.
- **Not a chatbot.** No chat input/history, no AI-generated advice, no AI prioritisation, no LLM or paid AI API. Output is generated deterministically from task data (`services/rana.ts`).
- Real macOS/Android unlock detection is out of scope for now; the briefing is shown on the first app open of each local day and can be replayed from Settings.

## 4. UI / UX decisions
- **Design system: Midnight Aurora** — immersive, premium, soft-rounded; dark and light themes are equal in quality, plus "system". All colours are CSS variables in `frontend/src/styles/index.css` (RGB channels) mapped to Tailwind names in `tailwind.config.ts`; components never hardcode colours.

  | Token (Tailwind) | Dark | Light |
  |---|---|---|
  | Background (`bg`) | `#080D18` | `#F4F7FC` |
  | Sidebar (`sidebar`) | `#0D1727` | `#FFFFFF` |
  | Surface (`surface`) | `#111F33` | `#FFFFFF` |
  | Elevated surface (`card`) | `#192B43` | `#E3ECF8` |
  | Primary accent (`accent`) | `#27C8FF` | `#168DCE` |
  | Secondary accent (`accent2`, violet) | `#7775FF` | `#7165D9` |
  | Electric blue (`electric`) | `#4D9FFF` | `#367DD1` |
  | Soft glow (`glow`) | `#A9DFFF` | `#DCEFFF` |

  Semantic colours (same hues in both themes, tuned for contrast): completed = green (`ok`), approaching = amber (`warn`), critical = red (`danger`), partner activity = cyan/blue (`partner`, = electric), neutral = muted grey. Partner identity (avatar, partner badge, partner progress bar) uses the violet secondary accent; "you" uses the primary accent.
- **Typography:** Manrope for headings and display (h1–h3, brand), Inter for body and UI, both self-hosted variable fonts via `@fontsource-variable`. Tabular numerals are on globally so times, countdowns and counts don't jitter. Scale: page headings 30–36px, section headings 20px, card headings 15–17px, body 14–15px, metadata 11–13px.
- **Atmosphere:** static ambient gradients only: faint cyan upper-right and violet lower-left on a fixed layer (no motion, no particles).
- **Surfaces:** radii: main surfaces 20px (`rounded-card`), tiles/rows 16px (`rounded-tile`), controls 14px (`rounded-ctl`), inputs 12px. 1px low-contrast borders and layered soft shadows (`shadow-card`, `shadow-lift`, `shadow-float`). Most task/habit cards are solid; glass is used only for the sidebar, top bar, floating RANA panel and modals.
- **Controls:** shared `Button` (primary / soft = secondary / ghost = quiet), `IconButton`, `Segmented` (tabs), `Switch`, `CheckButton`, form fields, badges. Touch targets are at least 44px (small visual controls such as check circles and switches get a 44px hit area). Known exception: habit calendar day cells are about 41px on 375px screens to fit seven columns. Focus rings, disabled states and press feedback are consistent.
- **Motion:** page fade (200ms), card hover elevation (pointer devices), completion pop, Together expand/collapse, gentle RANA float; most transitions 150–300ms; nothing loops except RANA's idle float; `prefers-reduced-motion` disables animation.
- **Aurora Cards** (one primitive, `components/ui/AuroraCard.tsx`, styled by `.aurora*` in `styles/index.css`; each variant sets `--aura`, the card's light colour). Geometry: 20px radius for primary surfaces (deadline and habit cards), 14px for small cards/rows; padding about 20px (large) or 14–16px (small). Glow is reserved for importance and is stronger in dark than light (light = softer, wider, more restrained; amber/red washes stay clean on white).
  - **Deadline:** edge illumination bar plus tinted wash and glow by urgency: critical (red, strongest glow), approaching (amber), normal (restrained cyan), completed (green, no glow). Larger bold title and clear countdown; on mobile the badge/bell/avatar row sits under the metadata so titles stay readable.
  - **Daily task:** solid surface, cyan hairline, no resting glow (cyan appears only on hover/focus); completed = green, muted, struck through with completion time.
  - **Habit:** cyan + violet atmospheric corner light and soft dual glow; per-participant "Done today / Pending" chips, independent streaks per person.
  - **Together:** cyan = you, violet = partner; expanding a card selects it (stronger border and glow).
  - **RANA:** small translucent cyan/violet information panel (companion bubble and briefing speech panel); never a permanent large panel.
  - **Info (secondary):** neutral, quiet, no glow (Daily progress, list rows).
  - **States:** default, hover (lift, 180ms, pointer devices only), pressed (100ms), focus-visible ring, selected/expanded (`aria-expanded`/`aria-pressed`), completed (`data-completed`), urgent (deadline tone), disabled (`aria-disabled`). All state styling is CSS-only; nothing depends on hover.
- **Partner Mode (viewing mode):** a small two-option switch in the top-right of the header (avatar + "My Mode" / "Partner Mode"; avatars only on phones; Partner Mode is disabled until a partner has joined). **My Mode** (default) shows my deadlines, upcoming tasks, habits and progress; **Partner Mode** shows my partner's. It applies consistently to **Home** (deadline groups, Coming up, Daily progress), **Today**, **Upcoming**, **Deadlines**, **Habits** and the sidebar badges, switches instantly with a short fade (no reload), shows a "Partner Mode · viewing <name>'s …" banner with a "Back to My Mode" button, and the choice is remembered on the device. Rules: it is **only a filter** — no permissions, ownership or completion records change. Tasks belong to their creator; habits belong to everyone who takes part (a shared habit appears in both views); streaks, today's status, progress and the calendar order always use the *viewed person's own* records (the viewed person's tile is listed first and highlighted); in Partner Mode habit completion controls are hidden/read-only (records are only ever written by their owner) and the 9:30 PM check-in is hidden. Tasks can still be viewed, edited and completed in Partner Mode (shared-workspace permissions). A partner's **personal habit is read-only** in the UI: no completion, edit, pause or delete (shared habits and your own personal habits stay manageable, and shared habits keep independent completion records for each person). The database still lets either member edit any habit; tightening that to owner-only for personal habits is an open decision. Without a partner, Partner Mode is disabled (a stored Partner Mode choice falls back to My Mode). The Together cards, Recent updates, Completed and Past / Missed always cover both people. Identity comes from user ids of the real workspace profiles (mock users in demo mode), never names or emails.
- Lucide icons only. Warmth comes from the violet partner accent and soft geometry.
- No space/planet imagery, no heavy neon, no chat UI.
- Responsive: persistent sidebar on desktop, slide-over drawer on mobile.
- **Time display: 12-hour with AM/PM everywhere** (e.g. `2:25 PM`, `9:30 AM`, `12:00 AM` at midnight, `12:00 PM` at noon), regardless of the device locale. This covers deadline and task times, countdown timestamps, completion times, Upcoming, Past / Missed, Completed, habit calendar details, RANA's briefing and the Add Task modal. Time entry uses a 12-hour picker (hour, minute and a separate AM/PM choice). It is a display and input convention only: stored values stay 24-hour `HH:mm` or ISO timestamps, calculations and time-zone handling are unchanged, and the planned 9:30 PM habit check-in is unchanged. Formatting lives in `services/dates.ts`; entry in `components/ui/TimePicker.tsx`. Dates still follow the device's date format.
- Sidebar: Home, Today, Upcoming, Deadlines, Habits, Completed, Past / Missed, Settings. Future/tomorrow/past items stay off the default Today screen.

## 5. Two-user model
- Exactly two users. Both have **full access** to all tasks at all times. There are no permission or access-request flows.

## 6. Shared notification behaviour
- Per-task toggle **Notify second user**. Enabled → both users get notifications for that item. Disabled → only the creator does. The toggle never affects access.
- A small shared-bell indicator appears on cards where it is enabled. (Phase 1: mock state only; no real notifications are sent.)

## 7. Deadline rules
- Urgency: **critical** (red) ≤ 3 h remaining, **approaching** (amber) ≤ 8 h, otherwise normal accent.
- Deadlines appear before ordinary tasks, ordered by urgency (soonest first).
- A completed deadline is never shown as urgent or overdue.
- When an incomplete deadline expires it moves to **Past Deadlines**, leaves the active list, keeps its historical record and stops future reminders. Expired items are missed opportunities, not an overdue backlog.
- Past deadlines are hidden by default on the Deadlines screen (separate view).

## 8. Completed task behaviour (critical)
- A completed task **stays visible in its original position for the whole day**: green check, struck-through title, completion time, muted look.
- Daily progress ("3 of 6 tasks completed") updates immediately.
- At the daily reset, completed items become Completed History. Incomplete daily tasks from earlier days appear under Past / Missed.
- Habits follow their own rules; see section 9.

## 9. Habits (final decisions)
### 9.1 Habit types
1. **Personal** — belongs to one user (the current user).
2. **Partner's** — belongs to the other user; visible to both.
3. **Shared** — both users participate.

Both users have full access to every habit (view, pause/resume). Completion, however, is recorded **per participant**: you check off your own occurrence only. A partner's personal habit is completed by its owner. For shared habits each person has an independent completion log, so completing a habit for yourself never completes (or overwrites) your partner's occurrence.

### 9.2 Scheduling
- Every day or selected weekdays. **No time of day** is required.
- Each scheduled day is a fresh occurrence. A missed occurrence stays in history and never blocks the next scheduled day. Unscheduled days are neutral.

### 9.3 9:30 PM check-in (planned — not implemented)
Every day at 9:30 PM in the device's local time zone, for every active habit scheduled that day:
- If the user already completed it → no reminder.
- Otherwise ask "Did you complete it today?" — **Yes** marks completed, **No** marks missed.
- No answer by midnight → automatically marked missed.
- Shared habits: each user gets their own check-in only if their own completion is still open.
- One check-in per user, never duplicated across that user's multiple devices.

Current mock frontend: no notification is sent and no prompt is shown. The only related behaviour is derived: today's occurrence stays open until midnight, after which it counts as missed (the outcome the planned midnight expiry would produce). The Habits screen carries a "Planned" notice and does not claim reminders work.

### 9.4 Streaks (per user, independent)
- Shown for each participant: **current streak** and **longest streak** (plus this-week %). For a shared habit both users' streaks are shown side by side; a partner's personal habit shows only its owner.
- A missed scheduled occurrence breaks that user's streak; unscheduled days do not. Today's still-open occurrence neither counts nor breaks.

### 9.5 History calendar
- Five-week Monday-aligned calendar per habit. Colours: **green** = you completed, **cyan/blue** = partner completed, **red** = missed, **neutral** = unscheduled, and an **outlined** cell = still open today (the legend lists all five). The selected date is outlined; the detail panel keeps a fixed minimum height so the card doesn't jump.
- Shared habits split each date into two halves (you left, partner right) with independent statuses.
- Dates are clickable: the detail panel shows whether the habit was scheduled, who completed it and when, who missed it, or that it is still open today.

## 10. Authentication and workspace (Supabase)
OurDay is a private app for two people, so authentication is deliberately simple.

### Approved decisions
- **Email + password** with a name at registration, a password-strength hint and a visibility toggle. **No mandatory email verification** (users get in immediately), and no OTP, magic links, MFA, social login, approval workflows or heavy onboarding.
- **Sessions** persist across refresh and browser restarts via Supabase's own persistence and token refresh; logout is explicit. Passwords are never stored by the app.
- **Password recovery** uses Supabase's reset-email link; expired/invalid links are handled gracefully.
- **Workspace:** one private workspace shared by exactly two accounts. The first user creates it (owner); the second joins with an invitation link/code. Invitations: random code, only its hash stored, single-use, 7-day expiry, owner can revoke and regenerate. One workspace per user, never a third member, enforced in the database (constraints + transactional functions), not in the UI.
- **Security:** Supabase Auth for accounts; Row Level Security on all workspace tables; no client writes to membership/roles; invitations not readable by clients. Only the public publishable key is used in the browser; the service-role key, database password and SMTP credentials never appear in frontend code. `.env.local` is gitignored; `frontend/.env.example` holds placeholders only.
- Task and habit permissions are **not** changed by this milestone (both members see and act on everything per the existing rules; the notification toggle never controls access).

### Implemented (code written; see "Verification status" for what was actually tested)
1. **Auth foundation:** Supabase client (public key only), `AuthProvider` (session restore, refresh, recovery events), route guards. **Demo mode:** with no `VITE_SUPABASE_*` env vars auth is off and the app runs on local mock data exactly as before.
2. **Database (4 migrations in `supabase/migrations/`):** `profiles`, `workspaces`, `workspace_members`, `workspace_invitations` (+ functions `create_workspace`, `create_invitation`, `revoke_invitation`, `get_invitation_status`, `accept_invitation`), then **`tasks`, `habits`, `habit_logs`** with RLS. Rules enforced by the database: one workspace per user, max two members (trigger + row locks), one owner, hashed single-use 7-day invitations, no client writes to membership/roles, invitations unreadable by clients. Tasks keep ONE completion record set by a trigger (can't be forged; re-completing doesn't overwrite it); habits are personal or shared and `habit_logs` holds one row per (habit, person, day), so completion is independent per person (everyone reads all logs, writes only their own, only for habits they take part in). Both members have full access to tasks and habits; the notify flag never affects access. Tables are published for Realtime with DEFAULT replica identity (deletes carry only the id).
3. **Auth screens:** Login, Register (name, email, password, strength guidance, show/hide), Forgot password (45 s resend cooldown, neutral message), Reset password (handles expired/invalid links), friendly errors (wrong password, existing email, network, rate limit, expired session), persistent sessions, sign-out (Settings). No email verification, OTP, MFA or magic links.
4. **Workspace pairing:** Setup (create or join), `/join/:code` (works after registering or signing in; the link is remembered), Settings → owner creates/copies/revokes invitations (the raw code is shown only once), friendly errors for invalid / expired / already-used / full / already-in-a-workspace invitations. The partner appears automatically when they join.
5. **Real data:** `RemoteAppProvider` loads tasks/habits/logs through RLS and maps them onto the existing app model; every screen uses the same `useApp()` interface, so the UI is unchanged. Identities (me / partner) come from real profiles; nothing is hardcoded. Task and habit create / edit / delete / complete are persisted (optimistic update, server is the source of truth, a failed save reverts and shows an error). New in the UI: pencil edit + delete (with confirmation) for tasks and habits.
6. **Realtime:** Supabase Realtime (Postgres changes) on tasks, habits, habit_logs and workspace members. Every event and every (re)connect triggers a debounced re-fetch (payloads are never trusted); fetches that started before a newer fetch or an in-flight write are discarded; if realtime is unavailable the app polls every 20 s and re-fetches on focus / when the network returns; an Offline indicator appears when the server can't be reached.
7. **9:30 PM check-in (in-app only):** while OurDay is open after 9:30 PM (device-local) an Aurora card asks Yes/No for each of your habits still open today. Yes = done, No = recorded as missed. Unanswered = missed at midnight (derived).

### Supabase setup log (project "OurDay", Mumbai / ap-south-1)
- Supabase CLI v3.0.0 installed (Homebrew); logged in; repository linked to the project (link state in `supabase/.temp/`, git-ignored).
- Remote migration history was empty; the four migrations in `supabase/migrations/` were applied in order with `supabase db push --remote` (no errors). Remote history now matches local.
- Verified on the live project: all 7 tables and their 16 indexes exist; with the public key, anonymous reads of every table and anonymous calls to the workspace functions are rejected (`42501`), i.e. grants/RLS are in force. Policy and function bodies were not catalog-queried (no Docker/psql); run `supabase/tests/*.sql` in the SQL Editor for the full check.
- `frontend/.env.local` (git-ignored) holds the project URL and the **publishable** key only; the service-role/secret keys are not used or stored anywhere.
- **Open dashboard actions:** turn **"Confirm email" OFF** (currently ON), set Site URL / Redirect URLs, and confirm the five tables are in the `supabase_realtime` publication (Database -> Replication).

### Verification status (Partner Mode: unit-tested filters; browser-checked in local demo mode, dark/light, desktop/mobile; not yet exercised against real Supabase profiles)
- **Tested locally (automated):** 98 SQL checks against an in-memory Postgres (`supabase/tests/local`, `npm test` there) covering workspace isolation, two-member limit, one workspace per user, invitation hashing/expiry/reuse/revoke, RLS on every table, immutable fields, single task completion record, and independent habit logs. 72 unit tests (`frontend`, `npm test`) for streaks, calendar state, deadline grouping/urgency, Coming up, per-person progress, row mapping, the sync reducer, error messages, password/invite helpers, debouncing and 12-hour time.
- **Tested in a browser against a throwaway FAKE backend (not Supabase):** registration (incl. duplicate email and wrong password), invitation creation, joining from a link on a second origin, rejected used/invalid codes, shared habit independence between two accounts, task completion by the partner, edit and delete, persistence across reload, sign-out, an unreachable server (offline indicator, reverted change, recovery), expired reset link, mobile and desktop layouts. This exercises the app's wiring, not Supabase itself.
- **NOT yet tested against the real Supabase project:** migrations applied there, real sign-up/login/reset emails, real RLS, and **Realtime delivery** (the fake has no websocket, so only the polling fallback was exercised). Do this after applying the migrations (see `supabase/README.md`).

### Not possible with the current architecture (planned)
- The 9:30 PM notification and midnight auto-miss **while the app is closed** need a scheduled backend job or native notification (e.g. Supabase scheduled function + push). Browser timers don't run when the app is closed, so the in-app check-in above is the reliable subset.
- Reminders/push notifications, IndexedDB offline write queue, PWA install, native Android/macOS companions.

## 11. Architecture
- `frontend/` — React + Vite + TypeScript + Tailwind CSS + Lucide + React Router.
- Layout: `components/{layout,tasks,habits,rana,ui}`, `pages`, `hooks`, `services` (pure date/selector/RANA logic), `store` (context + reducer), `data` (mock data), `types`, `styles`.
- Mock data is isolated in `src/data`; the store is the only place state is mutated, so it can later be swapped for IndexedDB + Supabase sync.
- Planned stack (not built): Supabase (auth + PostgreSQL + Realtime), IndexedDB offline-first, PWA, Vercel, native Android/macOS companions.

## 11b. macOS companion (`macos/OurDayCompanion/`)

**Approved product decision.** After every Mac unlock the *first* thing shown is a dedicated **RANA briefing window**, never the full dashboard.
1. Detect unlock → 2. show the RANA briefing window → 3. first unlock of the local calendar day: complete briefing (upcoming deadlines; today's and tomorrow's tasks; habit status and check-ins; important partner activity) → 4. later unlocks the same day: concise update of relevant changes since the previous briefing → 5. prominent **Open Full Dashboard** button → 6. **Dismiss** button → 7. dismissing closes only the window: the companion keeps running and notifications are unaffected → 8. one unlock event can never produce more than one briefing window (one window object is reused). The dashboard is never opened automatically.

**Architecture decisions**
- Swift + AppKit/SwiftUI menu-bar agent (`LSUIElement`, no Dock icon), separate from the web app. The dashboard is the deployed site (`https://ourdayapp.vercel.app`) in a `WKWebView` window, so the web app is unchanged and keeps its own Supabase session (the companion never handles the password or any key).
- Built with `swiftc` via `scripts/build-app.sh` (ad-hoc signed). **SwiftPM and XCTest do not work on this Mac** (only Command Line Tools installed; the manifest fails to link, no `XCTest`), so there is no `Package.swift`; tests are a dependency-free runner (`scripts/test.sh`). Full Xcode will be needed for notarised distribution.
- Unlock detection: `com.apple.screenIsLocked` / `com.apple.screenIsUnlocked` on `DistributedNotificationCenter`. **Limitation:** Apple documents no public "screen unlocked" API; these notifications are long-standing but undocumented and could change. Documented `NSWorkspace` sleep/wake/session notifications are used for state only (waking from sleep without a lock screen is *not* an unlock). `CGSessionCopyCurrentDictionary()["CGSSessionScreenIsLocked"]` seeds the initial state. No permission prompt is required. A browser/PWA cannot observe any of this.
- De-duplication (`CompanionCore/UnlockGate`): an unlock counts only if a lock was seen since the last accepted unlock, and not within 5 s of the previous one. Sleep-while-locked still fires on the later real unlock.
- Full vs. update: decided by the last briefing's local calendar day (`BriefingDay`, user's timezone).
- Setting "Show briefing when Mac unlocks" (menu bar) only controls the briefing window; it is independent of notifications. "Launch at login" uses `SMAppService.mainApp`.
- Local data: only the toggle and the last briefing day (UserDefaults); log at `~/Library/Logs/OurDayCompanion/companion.log` holds events only, no tokens or task content.

**Planned (not built)**
- Milestone 2: native deterministic briefing from Supabase (needs a native sign-in; the web view's session is not shared with Swift). Port `services/rana.ts` logic to Swift or fetch via the same RLS-protected tables with the publishable key + user JWT.
- Milestone 3: UserNotifications. **Supabase limitation:** nothing server-side can wake a closed Mac app without paid/Apple-key infrastructure (APNs needs a paid Developer account), so reminders must be scheduled locally with `UNCalendarNotificationTrigger` (system-delivered even if the app is not running) and rebuilt on every data change/launch/unlock via Realtime + a refetch. Partner notifications while the app is closed will be limited to those caught on the next refetch. Reminders 24h/12h/6h/3h/2h/1h/30m/15m/5m + at-deadline, past intervals skipped, cancelled on complete/delete, recomputed on edit, stable identifiers (`deadline-<id>-<interval>`) to avoid duplicates, 9:30 PM habit check-in. macOS caps pending local notifications at 64, so only the soonest deadlines are scheduled.

**Status (Milestone 1)**
- Verified on this Mac: builds and signs; runs in background with a menu-bar item; core logic tests 18/18; injected lock/unlock produces exactly one briefing window, ignores duplicate unlocks, first-vs-update works, Open Full Dashboard opens the dashboard window and closes the briefing, a later unlock reuses the single window.
- Simulated only (debug `--debug` injection): the above sequences.
- Not yet verified: a *real* lock → unlock on this Mac, launch-at-login across a real login, toggle-off behaviour, sleep/wake, light/dark appearance of the window, dashboard sign-in inside the web view.

## 12. Status
### Implemented frontend functionality
- Dark / light / system theme with tokens; responsive shell (sidebar on desktop, drawer on mobile); translucent sidebar with live badges and a two-user "in sync" card.
- **RANA briefing** (`/briefing`): first screen each local day (tracked in `localStorage`), deterministic copy, deadlines → tasks → your habits, "Let's get started" opens Home. Replay from Settings or the floating companion. Floating RANA shows a status line and acknowledges completions.
- **Today**: urgency-coloured deadline cards with live countdown, daily task cards, a compact, secondary **Daily progress** widget (tasks done/total, your habits done/total, a small percentage; shown in the side column on desktop and below the habits on mobile, so it never pushes tasks down), swipe-right-to-complete on touch, check controls elsewhere. Completed items keep their position (green check, strikethrough, completion time, muted); undo is possible the same day. Habits section shows your personal and shared habits (with your partner's status on shared ones) and, read-only, your partner's personal habits.
- **Habits** (section 9): personal / partner's / shared types with All·Mine·Partner's·Shared filter, independent per-user completion, per-user current and longest streaks, weekly %, two-user clickable calendar, pause/resume.
- **Add Task**: Daily / Deadline / Habit with conditional fields and validation. Habits choose *Just me* or *Shared*, every day or selected weekdays, no time. The *Notify second user* toggle applies to tasks and personal habits (hidden for shared habits, where both are participants). Default off.
- **Home** (**Today's Deadlines** and **Tomorrow's Deadlines** containers, each listing every open deadline for that day as its own Aurora card, earliest first, with an empty state when none; tomorrow's cards are slightly calmer; completing a deadline removes it immediately; **Coming up** lists all open future deadlines, including those two days, plus future daily tasks, hides completed deadlines, and when it exceeds 5 items shows only the next 3 deadlines; and a side column with the compact progress widget, Together and recent updates). **Together** has one expandable card per person (click anywhere on the card; each toggles independently and both can stay open) listing that person's *Completed today* and *Remaining* items with category (Daily task / Deadline / Habit) and completion time. Counting rules: only today's active items count (no future tasks, expired deadlines or paused habits); a task has a single completion record, so an open task belongs to its creator and a completed one to whoever completed it, and is never double-counted; habits use per-user logs, so a shared habit appears once per participant with independent status and a partner's personal habit appears only for them, **Upcoming**, **Deadlines** (Active | Past), **Completed**, **Past / Missed** (including missed habit days per user), **Settings** (theme, account/partner placeholders, replay briefing).
- Deadline expiry and habit missed-state are derived from the clock.
### Mock-only functionality
- All tasks, habits, history, the partner (Aanya) and activity are sample data held in memory and reset on reload. Partner actions are never live.
- The notify toggle and bell are visual; no notifications are sent. Account/partner info in Settings is static.
### Planned backend / notification functionality
- Supabase auth/DB, realtime sync, IndexedDB offline storage, PWA install.
- Real reminders and notifications, including the 9:30 PM habit check-in with midnight auto-miss and per-user de-duplication across devices (section 9.3).
- Full recurrence engine, habit archive, editing/deleting items, unlock-triggered briefing on macOS/Android.

## 13. Open product decisions
- Default for *Notify second user* (Phase 1: off).
- Whether today's completions should also appear on Completed before the daily reset (Phase 1: no).
- Urgency thresholds (currently 3 h critical / 8 h approaching).
- Daily reset time (Phase 1: local midnight).
- Whether future items are completable from Upcoming (Phase 1: view-only).
- Where "Let's get started" lands (Phase 1: Home).
- Whether a user may mark a partner's personal habit complete on their behalf (Phase 1: no — only the owner completes it).
