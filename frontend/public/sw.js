/* OurDay service worker: app shell offline + Web Push.
 * __PRECACHE__ and __BUILD__ are filled in at build time by the `ourday-sw` Vite plugin (vite.config.ts).
 * It never touches Supabase/API traffic: data is cached by the app itself (see src/services/offline). */
const BUILD = '__BUILD__'
const PRECACHE = self.__PRECACHE__ || []
const SHELL_CACHE = `ourday-shell-${BUILD}`

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((c) => Promise.all(['/index.html', ...PRECACHE].map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ourday-shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // Supabase, fonts CDNs etc. are never intercepted
  if (req.mode === 'navigate') {
    // Network first (fresh deploys), cached shell when offline. Client-side routes all resolve to index.html.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(SHELL_CACHE).then((c) => c.put('/index.html', res.clone()))
          return res
        })
        .catch(() => caches.match('/index.html').then((r) => r || Response.error())),
    )
    return
  }
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest' || url.pathname === '/favicon.svg') {
    // Content-hashed build output: cache first.
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(SHELL_CACHE).then((c) => c.put(req, res.clone()))
            return res
          }),
      ),
    )
  }
})

/* ---- Web Push ------------------------------------------------------------------------------------ */
self.addEventListener('push', (event) => {
  let p = {}
  try {
    p = event.data ? event.data.json() : {}
  } catch {
    p = { title: 'OurDay', body: event.data ? event.data.text() : '' }
  }
  const kind = p.kind || 'deadline'
  const actions = kind === 'habit' && p.habitId ? [{ action: 'habit-yes', title: 'Yes, done' }, { action: 'habit-no', title: 'Not today' }] : []
  event.waitUntil(
    self.registration.showNotification(p.title || 'OurDay', {
      body: p.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/favicon-32.png',
      tag: p.id || undefined, // the same notification id never shows twice
      renotify: false,
      data: { url: p.url || '/home', id: p.id, kind, habitId: p.habitId || null },
      actions,
      timestamp: p.occurredAt ? Date.parse(p.occurredAt) : Date.now(),
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  const d = event.notification.data || {}
  event.notification.close()
  let target = d.url || '/home'
  if (event.action === 'habit-yes' || event.action === 'habit-no') {
    const answer = event.action === 'habit-yes' ? 'done' : 'missed'
    target = `/habits?checkin=${encodeURIComponent(d.habitId)}&answer=${answer}&nid=${encodeURIComponent(d.id || '')}`
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const w = wins.find((c) => 'focus' in c)
      if (w) {
        // The running app handles it in place (no reload) and still ends up on the right screen.
        w.postMessage({ type: 'ourday:navigate', url: target })
        return w.focus()
      }
      return self.clients.openWindow(target)
    }),
  )
})
