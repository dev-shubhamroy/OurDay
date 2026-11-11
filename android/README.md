# OurDay for Android (native)

A genuinely native Android client for OurDay: Kotlin, Jetpack Compose, Material 3. It uses the **existing** Supabase project (same accounts, same workspace, same tables, same row level security). It is not a WebView and it does not replace the web app, the Mac companion, or any backend.

| | |
|---|---|
| Package | `com.ourday.app` (debug builds install as `com.ourday.app.debug` so they can sit beside a release build) |
| Min / target SDK | 26 / 35 |
| UI | Jetpack Compose, Material 3, Navigation Compose, edge-to-edge, light/dark |
| Data | Room (local source of truth) + persistent sync queue + WorkManager |
| Backend | Supabase Auth + PostgREST (+ Realtime plugin installed) via `supabase-kt`, publishable key only |
| Push | Firebase Cloud Messaging foundation (needs your `google-services.json`); web push is untouched |
| Modules | `:domain` (pure Kotlin, all business rules, fast JVM tests) and `:app` (Android) |

Start with [BUILD_AND_INSTALL.md](BUILD_AND_INSTALL.md). Design is in [ARCHITECTURE.md](ARCHITECTURE.md). What works, what is partial and what is blocked is in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

## What is in the app
The same product as the web app, in native Compose with the web's design tokens (Fusion: graphite, soft crimson, Manrope + Inter, flat aurora-bordered cards, deadline edges, check buttons, urgency badges):

- **Today** (greeting, date, deadlines, tomorrow's deadlines as a separate group, daily tasks, habits, coming up, RANA entry), **Tasks** (create, edit, delete, complete, reopen, swipe to complete, filters, sorting, optional deadline), **Habits** (personal, partner's, shared; schedules; independent per-person status, streaks, history), **Shared** (request/approve/reject completion, reminders, reopen), **More** (RANA, Past and missed, Sync and offline, Settings).
- **Partner Mode** toggle in the header of Today, Tasks and Habits (remembered across restarts); a viewing filter only.
- **RANA**: greeting, saved quote, deadlines, today's plan, one closing action.
- **Home-screen widget** "OurDay · Today" (Glance).
- 9:30 PM habit check-in with Yes/No actions, native notifications from the server's existing rows, offline-first editing with automatic sync.

## Honest status in one paragraph
The app compiles, lints clean (0 errors), has 109 passing unit tests and builds a debug APK. **It has not been installed or run on a phone or emulator** (none was available), so runtime behaviour, layouts and the Supabase calls against the real backend are unverified. Instant push (FCM) needs a Firebase project you create and a server sender that is prepared but not deployed; until then the app shows OurDay's server notifications by checking for new ones about every 15 minutes.
