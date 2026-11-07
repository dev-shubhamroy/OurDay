# OurDay

**Plan together. Stay in sync.** A shared productivity space for two, with RANA, your daily briefing companion.

See [`OURDAY_SPEC.md`](OURDAY_SPEC.md) for the product specification.

## Run

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build
npm run lint
```

Phase 1 is frontend-only and uses mock data.

## Structure

```
frontend/src
  components/{layout,tasks,habits,rana,ui}
  pages  hooks  services  store  data  types  styles
```

Mock data lives in `src/data`; pure logic (dates, urgency, selectors, RANA copy) in `src/services`.

## Authentication (Supabase)

Copy `frontend/.env.example` to `frontend/.env.local` and fill in the **public** project URL and publishable key. `.env.local` is git-ignored. Never put the service-role key, database password or SMTP credentials in any `VITE_` variable. Without these variables the app runs in local demo mode (no login).

## Tests

```bash
cd frontend && npm test            # unit tests (streaks, grouping, mapping, sync reducer, ...)
cd supabase/tests/local && npm install && npm test   # SQL migrations + security tests in an in-memory Postgres
```
