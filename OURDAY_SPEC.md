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
| Habit | Recurring practice, one occurrence per scheduled day | name, recurrence (every day / selected weekdays), notes, notify toggle |

## 3. RANA
- Friendly floating robotic companion: black metallic body, glowing blue expressive eyes, machine-like (never human), subtle float, small eye movements, restrained greeting/acknowledgement animations.
- **First screen of each day** is RANA's daily briefing, in this order: (1) today's deadlines by urgency, (2) today's daily tasks, (3) today's habits (separate section). Ends with a **Let's get started** action that opens the workspace.
- Also appears as a small floating companion in the workspace.
- **Not a chatbot.** No chat input/history, no AI-generated advice, no AI prioritisation, no LLM or paid AI API. Output is generated deterministically from task data (`services/rana.ts`).
- Real macOS/Android unlock detection is out of scope for now; the briefing is shown on the first app open of each local day and can be replayed from Settings.

## 4. UI / UX decisions
- Dark (`bg #080D18`, surface `#111B2B`, card `#18283D`, accent `#27C8FF`) and light (`bg #F5F8FC`, surface `#FFFFFF`, card `#EAF1F9`, accent `#168DCE`) themes, plus "system".
- Geometric sans (Outfit), subtle gradients, restrained glow, rounded layered cards, translucent sidebar, glass floating panels, Lucide icons only.
- Warmth: a soft coral tone identifies the partner; accent cyan identifies "you".
- No space/planet imagery, no heavy neon, no chat UI.
- Responsive: persistent sidebar on desktop, slide-over drawer on mobile.
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
- Habits: a missed occurrence stays recorded as missed; the next scheduled day gets a fresh occurrence.

## 9. Architecture
- `frontend/` — React + Vite + TypeScript + Tailwind CSS + Lucide + React Router.
- Layout: `components/{layout,tasks,habits,rana,ui}`, `pages`, `hooks`, `services` (pure date/selector/RANA logic), `store` (context + reducer), `data` (mock data), `types`, `styles`.
- Mock data is isolated in `src/data`; the store is the only place state is mutated, so it can later be swapped for IndexedDB + Supabase sync.
- Planned stack (not built): Supabase (auth + PostgreSQL + Realtime), IndexedDB offline-first, PWA, Vercel, native Android/macOS companions.

## 10. Status
### Implemented
- Repository, tooling, domain types, design tokens (Milestone 1–2 in progress).
### Mock-data only
- All tasks, habits, history, partner activity and notification toggles (no backend, no real notifications).
### Planned for later phases
- Supabase auth/DB, realtime sync, IndexedDB offline storage, PWA install, real reminders/notifications, full recurrence engine, habit pause/archive management, unlock-triggered briefing on macOS/Android.

## 11. Open product decisions
- Whether today's completions should also be listed on the Completed screen before the daily reset (Phase 1: no, they stay on Today).
- Exact urgency thresholds (currently 3 h / 8 h).
- Daily reset time (Phase 1: local midnight).
