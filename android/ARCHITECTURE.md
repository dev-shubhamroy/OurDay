# Architecture

```
android/
  domain/        pure Kotlin/JVM: models, every business rule, RANA, sync engine, routing, validation   (80 unit tests)
  app/           Android: Room, Supabase gateway, repositories, WorkManager, notifications, Compose UI    (6 unit tests)
```

**Why two modules instead of the suggested ~15.** The rules (habit occurrences, streaks, deadline reminders, RANA, sync queue) are the risky part, so they live in a plain-JVM module that is tested in seconds with no Android runtime and cannot depend on Android by construction. The UI/data layers are packages inside `:app` (`ui/`, `data/{db,remote,repo,local,prefs}`, `sync/`, `notifications/`, `di/`). Splitting `:app` further would add Gradle/Hilt wiring without a technical gain at this size; the package boundaries already enforce UI → repository → Room/Supabase.

## Data flow (offline-first)
```
Compose screens ── ViewModels ── OurDayRepository ──reads── Room (Flows)  ◄── pull (server snapshot + queue re-applied)
                                       │writes
                                       ▼
                                 SyncManager.submit(op)
                         1. persist op in Room queue (op_queue)      ← survives process death and reboot
                         2. apply op to Room immediately (optimistic)
                         3. WorkManager "sync-now" (needs network, exponential backoff)
                                       ▼
                       SyncEngine.flush → SupabaseGateway.execute(op) → PostgREST (RLS applies)
```
- **Room is the single source of truth for the UI.** Room = last server snapshot + every still-queued op re-applied on top, so unsynced work never disappears.
- **Ops are data** (`Op` sealed interface, kotlinx.serialization): task insert/patch/complete/delete, habit insert/patch/delete, habit log. They carry client UUIDs and absolute target values, so replays are idempotent (insert duplicate key → treated as success; complete/log are upserts to a target state).
- **Compaction** (port of the web queue): last completion state wins; edits fold into an offline-created item; create+delete cancels out; an in-flight op is never edited.
- **Sync states** per item: `SYNCED`, `PENDING`, `SYNCING`, `FAILED`, `CONFLICT`. Shown as a small badge and a strip ("Offline · 2 changes saved on this phone").
- **Failures**: network/5xx/429 → keep op, retry with backoff (WorkManager `BackoffPolicy.EXPONENTIAL`). Session expired → stop, flag "sign in again", keep every op. Server refusal (RLS/validation) → drop only that op and list it under Sync and offline.
- **Conflicts**: a patch records the field values it started from. If the server row is newer and one of the same fields changed on the server to something other than what we are writing, the op is **not** applied (never overwrite newer data blindly), the item is marked `CONFLICT`, the newer server value is shown, and the issue is listed until dismissed. Completion and habit logs are intent-based absolute states and are applied.
- **Refresh**: pull-to-refresh, after every sync, and a 15-minute periodic WorkManager job. The Realtime plugin is installed but a live subscription is not wired yet.

## Database integration
No schema changes are required for tasks, habits, shared tasks or quotes. Android reads/writes the existing tables with the signed-in person's own JWT:
`workspace_members`, `workspaces`, `profiles`, `tasks` (kinds `daily`/`deadline`/`shared`), `habits`, `habit_logs`, `inspiration_quotes` (read-only), `notification_preferences`, and the shared-task RPCs `request_shared_completion`, `review_shared_completion`, `reopen_shared_task`, `send_task_reminder`. Android never creates a workspace (users create/join one in the web app).

## Authentication
`supabase-kt` Auth, email + password, same accounts as the web. The SDK persists and refreshes the session. Offline with an expired token the stored session still identifies the person, so the app keeps working from Room and syncs after the next successful refresh. Sign-out clears Room, the queue and DataStore user state and removes this device's token (confirm dialog warns about unsynced changes).

## Habit occurrence logic (`HabitRules`, port of the web/Mac rules)
Each scheduled day is its own occurrence; unscheduled days are `OFF` (never missed); a scheduled past day without a completion is `MISSED` and stays in history; a miss never blocks the next occurrence; streak = consecutive completed scheduled days (a miss breaks it, unscheduled days and today's pending do not); shared habits have an independent log per person; a partner's personal habit is read-only. Weekdays use the database convention 0 = Sunday … 6 = Saturday.

## 9:30 PM check-in (`CheckIn`, `CheckInScheduler`)
WorkManager one-time work with an initial delay to the next local 21:30, rescheduled by the worker itself, and again on boot / time-zone change / clock change / app update (`SystemEventsReceiver`). Notification actions **Yes** → done, **No** → missed, written as the person's own log through the same queue, idempotently (never downgrades a completion). Not asked again once answered. "No answer by midnight = missed" is derived (a past scheduled day without a completion is missed), so nothing is written at midnight. **Limits:** Android may delay WorkManager by minutes (Doze, battery optimisation, OEM task killers); the exact minute is not guaranteed, and if the phone is off the question appears when it next runs.

## Deadline reminders
The backend already creates them (pg_cron every minute → `notifications` → push), with the 10 intervals, "skip intervals already in the past", cancel-on-complete/delete and edit-restart rules. Android does **not** run a second reminder engine. `Reminders` in `:domain` mirrors the server rule only to show "Next reminder" and to keep the rule tested.

## RANA
`Rana.build` (pure, deterministic, no AI): greeting, date, Needs attention (overdue / ≤3h / ≤8h / left over from yesterday), Today's schedule, missed habits, partner updates (named, completions and shared-habit check-ins only), closing, and one quote under "JUST KNOW THAT –" from the Inspiration Library (hidden when empty, never invented). First briefing of the local day is full; later ones are concise updates ("what changed since…"). The quote is stable while the briefing is refreshed and changes for the next briefing; no repeats until the library is exhausted. The same builder can feed future notifications.

## Notifications
- Channels: Urgent deadlines (high, heads-up), Tasks, Shared tasks, Habit check-ins (high), RANA (low).
- `NotificationRouting` (pure, tested) maps a payload (`kind`, `subtype`, `task_id`, `habit_id`) to a channel and a screen; `ourday://` deep links open Today, a task, Habits, Shared or RANA; tapping works from a notification or a link.
- **Native push (FCM) — foundation only.** The app can register a token (`device_tokens`, prepared unapplied migration), refresh it, remove it on sign-out and display `data` messages. It needs your `google-services.json` and **a server-side sender that does not exist yet** (FCM HTTP v1 needs a Firebase service account secret, set as a Supabase Edge Function secret; never in the app).
- **No duplicates between Web Push and FCM:** a device has one `route` (`fcm` or `webpush`). Until a sender exists the phone keeps using web push. When you enable FCM on a phone, turn off "Phone notifications" in the web app on that same phone. The sender must deliver to a device through its chosen route only (`NotificationRouting.shouldDeliver`).
- **Undefined triggers are not invented.** The product defines: deadline reminders, the 9:30 PM habit check-in, partner activity, shared-task requests/reminders. There is no defined trigger for "normal task" notifications or RANA push, so the channels exist but nothing sends to them.

## Design system (web parity)
`ui/theme/Theme.kt` holds the **same tokens as `frontend/src/styles/index.css`** (dark = approved palette, light = derived): bg `#111113`/`#F7F7F8`, surface, elevated, accent `#FF6A6F`/`#D6454C`, button `#D23B41`, accent-2 (habit/partner) `#C9B8FF`/`#6954C8`, electric, ok, warn, danger, hairlines as white/black at 8-30% alpha. Radii: card 20, tile/control 14, input 12, deadline 16. Fonts: **Manrope** (headings) and **Inter** (body), bundled as variable fonts (OFL). `ui/design/Design.kt` rebuilds the web primitives: `OdCard` (flat surface + aura-tinted hairline), `deadlineEdge` (4dp coloured edge), `CheckButton`, `UrgencyBadge`, `Avatar`, `Pill`, `SectionTitle`, `DashedEmpty`, `FilterPill`, `ModeToggle`, `OdButton`. `ui/components/Components.kt` composes them into `DeadlineCard`, `TaskCard`, sheets, dialogs, fields, `SwipeToComplete`. Screens use only these, so a visual change is made once.

## Partner Mode (`ViewRules`, port of the web viewMode + selectors)
A **viewing filter**, never an account or workspace switch. `ViewMode` (ME/PARTNER) is stored in DataStore (`view_mode`, remembered across restarts like the web's localStorage) and resolved against whether a partner exists (no partner → My Mode). `AppUi.subject` is whose context is shown; `AppUi.tasks` = that person's personal tasks; `AppUi.habits` = habits that person takes part in (personal + shared). **Shared tasks are never filtered by mode** (`ViewRules.sharedTasks`); shared habits appear in both. A partner's personal habit is read-only (`canWriteHabit`); you can only ever write your own log row, and each person's completion stays independent. The toggle (`ModeToggle`) is in the header of Today, Tasks and Habits; a banner states whose context is on screen. The Habits filters All/Mine/Partner's/Shared: All follows the mode, the others look at the whole workspace.

## RANA on Android (`BriefBuilder`)
Greeting → saved quote → deadlines needing attention → today's plan → one closing action. Built from the same deterministic rules as `Rana.build`, a task never appears twice, nothing else is shown (no intro text, counts, habit or partner commentary). Hidden sections stay hidden (no quote → no quote block).

## Home-screen widget (`widget/TodayWidget.kt`, Jetpack Glance)
Reads the **same Room database** through a Hilt entry point (no second store). `WidgetRules` (pure, tested) picks your tasks for today (open first in time order, then done), the number left, and the next open deadline. Responsive layouts (compact / wide / expanded), light and dark. Tapping the header opens Today, a task opens it (`ourday://task/<id>`), the circle completes or reopens it through the normal offline-first path. It is re-rendered after every local change and every sync, and by the OS hourly (a cheap local re-render, no network) so the day rolls over; there is no polling.

## Notification delivery (diagnosis and design)
Why nothing appeared before: (1) the only native notification was the 9:30 PM check-in; (2) FCM never started because no `google-services.json` exists; (3) even with a token, production has no `device_tokens` table; (4) no server sender existed. All deadline/shared/partner notifications are created by the backend and were delivered only through Web Push to the browser/PWA.
What is implemented now:
- **`NotificationPoller`** shows the backend's existing `notifications` rows (RLS: yours only) as native notifications when the app syncs: about every 15 minutes in the background (WorkManager's minimum), and when the app opens or changes data. No Firebase needed. It invents no triggers (deadline reminders, shared-task requests/reminders and partner activity only), skips read/already-shown rows, starts "from now" so old history never floods, and skips the 21:30 habit rows because the on-device check-in handles them.
- **One route per device** (`DeliveryRules.mode`): FCM once a device token has really been registered, otherwise the periodic check, otherwise off. The checker switches itself off when FCM is active.
- **Prepared, not applied/deployed:** migration `20261112100000_android_device_tokens.sql` and an FCM branch in `supabase/functions/send-push/index.ts` (data-only message, 5-minute TTL for deadlines, dead tokens removed). Needs `FCM_PROJECT_ID` + `FCM_SERVICE_ACCOUNT_JSON` secrets and your `google-services.json`.
- **Duplicates with Web Push:** the same phone must use one route. Turn off "Phone notifications" in the OurDay web app on a phone that uses this app. (The server cannot tell which web subscription belongs to which phone.)
