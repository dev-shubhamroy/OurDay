# Implementation status

## Verified by tooling
- `./gradlew :domain:test :app:testDebugUnitTest` — 103 + 6 tests pass (adds Partner Mode, concise RANA, widget data and notification-delivery tests).
- `./gradlew :app:lintDebug` — 0 errors, 69 warnings (mostly "newer library version available").
- `./gradlew :app:assembleDebug` — `app/build/outputs/apk/debug/app-debug.apk` (about 28 MB). `assembleRelease` builds an unsigned, R8-minified APK (about 4 MB).
- Merged manifest inspected: package, permissions, Supabase/Settings initialisers kept, WorkManager default initialiser removed (Hilt factory used), no service-role string in the dex.

## NOT verified (no phone or emulator was available)
Installing and launching the app; the Hilt graph at runtime; real Supabase sign-in/queries/RPCs from the app; Compose layouts on real screens; WorkManager timings; notification display; the release (R8) build at runtime. **Treat everything under "Working" as "compiles and passes unit tests", not "seen working".**

## Working (code complete, unit-tested where logic exists)
- Auth screens (sign in / sign up / sign out, validation, password visibility, errors, session restore).
- Today dashboard, Tasks (CRUD, complete/reopen, filters, sort, optional deadline for shared tasks), Habits (CRUD, schedules, independent per-person status, streaks, history, pause), Shared tab (list, request/approve/reject, remind, reopen; needs a connection), RANA screen, Settings (theme, 24-hour time, timezone info, notification permission, synced preferences, sync info, version, sign out), Sync and offline screen.
- Room persistence, persistent op queue, compaction, idempotent replay, retry/backoff, auth-expiry handling, conflict detection.
- 9:30 PM check-in scheduling with Yes/No actions; boot / time-zone / clock rescheduling.
- Notification channels, routing, deep links, token registration code.

## Partially implemented
- **Native push:** channels, permission, token registration/refresh/removal and message display exist; **no sender** and the `device_tokens` migration is prepared but unapplied; needs your `google-services.json`.
- **Realtime:** plugin installed, no live subscription (refresh is pull-based).
- **Conflict resolution UI:** conflicts are detected, shown and listed; there is no "re-apply mine" button yet.
- **Task history:** completed tasks (who/when) are listed; there is no per-task audit trail beyond the existing schema (shared-task approval history exists server-side but is not shown).
- **Time format / timezone:** 24-hour preference is applied in lists; the timezone follows the phone (not user-editable).
- **Edit shared task approval state from Today:** shared tasks live on the Shared tab only.

## Not started
Inspiration Library editing (web only; the app reads quotes), partner invitation (web only), release signing, Play Store packaging, instrumented/UI tests, an app-wide accessibility audit, widget, localisation.

## Blocked / needs you
- Firebase project + `google-services.json` + a FCM sender secret (free tier, no billing).
- Approval to apply `20261112100000_android_device_tokens.sql` (backward compatible, additive).
- A phone or emulator to run the app and confirm behaviour.

## Production changes required
None for the app to work with tasks, habits, RANA, shared tasks and quotes. Only native push needs the prepared migration and a sender.


## Refinement sprint (web visual and product parity)
**Done (compiles, unit-tested where there is logic, not yet seen on a device):**
- Design tokens, fonts (Manrope + Inter) and primitives rebuilt from the web CSS; Today, Tasks, Habits, Shared, More, Settings, Sync, Auth and the editors restyled; custom bottom navigation; swipe-to-complete; dashed empty states; sheets ask before discarding typed text.
- **Partner Mode**: header toggle on Today/Tasks/Habits, remembered, viewing filter only, shared items in both modes, partner habits read-only (`ViewRules`, 8 tests).
- **RANA** reduced to greeting, saved quote, deadlines, today's plan, closing action (`BriefBuilder`, 6 tests).
- **Widget** (Glance, responsive, light/dark, complete-from-widget, deep links, refresh after changes and syncs; `WidgetRules`, 5 tests).
- **Notifications**: cause diagnosed (see ARCHITECTURE.md); native notifications from the server's existing rows via `NotificationPoller` (no Firebase), one-route-per-device rule, FCM sender and device-token migration prepared but not applied or deployed.

**Still unverified (needs your phone):** every screen's appearance and spacing against the web, gestures and animations, the widget on a real launcher and its tap/complete actions, a notification actually appearing (15-minute check, and later FCM), Partner Mode against real data, the release build.
**Known limits:** the 15-minute check cannot deliver a 5-minute deadline reminder on time (Android's WorkManager minimum), only FCM can; the Habits "Mine/Partner's/Shared" pills look at the whole workspace while "All" follows the mode; the widget shows your own tasks regardless of Partner Mode; no habit "category" exists in the OurDay schema, so none is offered.

## Reference-driven redesign (Home, Today, Deadlines, Habits)
- Bottom navigation is now Home / Today / Deadlines / Habits / More; Tasks and Shared are full-screen routes opened from Home (Tasks heading, "Shared with …").
- One shared header (`AppHeader`): wordmark, notification bell (opens Settings; Android has no notification-centre screen) and the Partner Mode switch.
- New: `HomeScreen`, `DeadlinesScreen` (Past container last, real count), restyled Today and Habits (summary, segmented filter, stats panel, Monday-Sunday week strip).
- New domain selectors with tests: `TaskRules.upcomingDeadlines/futureDeadlines`, `HabitRules.summary/week`.
