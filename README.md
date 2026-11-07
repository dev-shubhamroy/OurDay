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
