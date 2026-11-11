// OurDay · send-push (Supabase Edge Function, Deno).
// Called by the database (pg_net) with { id } for a freshly created notification. Claims the row exactly once
// (UPDATE ... WHERE push_sent_at IS NULL), then Web-Pushes it to every subscription of the recipient.
// Secrets (set with `supabase secrets set`): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, PUSH_SECRET.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the platform. Deploy with --no-verify-jwt:
// the caller authenticates with the shared x-push-secret header instead.
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com', Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
const targetFor = (n: { kind: string; habit_id: string | null; task_id: string | null; subtype: string | null }) => (n.subtype ? (n.task_id ? `/shared?task=${n.task_id}` : '/shared') : n.habit_id || n.kind === 'habit' ? '/habits' : n.kind === 'deadline' ? '/deadlines' : '/home')

// ---- native Android (FCM HTTP v1) -------------------------------------------------------------------------------------------
// PREPARED, NOT DEPLOYED. Needs the secrets FCM_PROJECT_ID and FCM_SERVICE_ACCOUNT_JSON (a Firebase service account; server-side only) and the
// table public.device_tokens (migration 20261112100000). Without them this does nothing and Web Push is unchanged.
let fcmToken: { value: string; exp: number } | null = null
const b64url = (b: ArrayBuffer | string) => btoa(typeof b === 'string' ? b : String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

async function fcmAccessToken(): Promise<string | null> {
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON')
  if (!raw) return null
  if (fcmToken && fcmToken.exp > Date.now() + 60_000) return fcmToken.value
  const sa = JSON.parse(raw) as { client_email: string; private_key: string }
  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }))}`
  const pem = sa.private_key.replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '')
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned))
  const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${b64url(sig)}` }) })
  if (!res.ok) return null
  const j = (await res.json()) as { access_token: string; expires_in: number }
  fcmToken = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 }
  return fcmToken.value
}

// Data-only message: the Android app builds the notification itself (channel + deep link) from the same fields Web Push carries.
async function sendFcm(n: { id: string; user_id: string; kind: string; title: string; body: string; habit_id: string | null; task_id: string | null; subtype: string | null }): Promise<number> {
  const project = Deno.env.get('FCM_PROJECT_ID')
  if (!project) return 0
  const { data: toks, error } = await db.from('device_tokens').select('id, token').eq('user_id', n.user_id).eq('route', 'fcm')
  if (error || !toks?.length) return 0 // table missing (migration not applied) or no Android device registered
  const access = await fcmAccessToken()
  if (!access) return 0
  let sent = 0
  await Promise.all(toks.map(async (t) => {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${project}/messages:send`, {
      method: 'POST', headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { token: t.token, data: { id: n.id, kind: n.kind, title: n.title, body: n.body, task_id: n.task_id ?? '', habit_id: n.habit_id ?? '', subtype: n.subtype ?? '' }, android: { priority: 'HIGH', ttl: n.kind === 'deadline' ? '300s' : '3600s' } } }),
    })
    if (res.ok) sent++
    else if (res.status === 404 || res.status === 410) await db.from('device_tokens').delete().eq('id', t.id) // uninstalled / token rotated
    else console.error('fcm failed', { status: res.status, notification: n.id })
  }))
  return sent
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  if (req.headers.get('x-push-secret') !== Deno.env.get('PUSH_SECRET')) return json({ error: 'unauthorized' }, 401)
  const { id } = (await req.json().catch(() => ({}))) as { id?: string }
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return json({ error: 'bad id' }, 400)

  // Claim: only the first caller gets the row, so retries/sweeps can never double-send.
  const { data: rows, error } = await db.from('notifications').update({ push_sent_at: new Date().toISOString() }).eq('id', id).is('push_sent_at', null).select('id, user_id, kind, title, body, habit_id, task_id, occurred_at, subtype')
  if (error) return json({ error: error.message }, 500)
  const n = rows?.[0]
  if (!n) return json({ skipped: 'already sent or unknown' })

  // Respect preferences (the generator already does; this also covers a switch turned off since).
  const { data: pref } = await db.from('notification_preferences').select('master, deadlines, habits, partner').eq('user_id', n.user_id).maybeSingle()
  if (pref && (!pref.master || (n.kind === 'deadline' && !pref.deadlines) || (n.kind === 'habit' && !pref.habits) || (n.kind === 'partner' && !pref.partner))) return json({ skipped: 'preferences' })

  const fcmSent = await sendFcm(n)
  const { data: subs } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', n.user_id)
  if (!subs?.length) return json({ sent: fcmSent })

  const payload = JSON.stringify({ id: n.id, kind: n.kind, title: n.title, body: n.body, habitId: n.habit_id, taskId: n.task_id, url: targetFor(n), occurredAt: n.occurred_at })
  let sent = 0
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: n.kind === 'deadline' ? 300 : 3600, urgency: n.kind === 'deadline' ? 'high' : 'normal' })
        sent++
        await db.from('push_subscriptions').update({ last_success_at: new Date().toISOString() }).eq('id', s.id)
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) await db.from('push_subscriptions').delete().eq('id', s.id) // uninstalled / revoked
        else console.error('web-push failed', { status: status ?? 'network', notification: n.id }) // 401/403 = VAPID mismatch, 429 = throttled (never logs endpoints or keys)
      }
    }),
  )
  return json({ sent: sent + fcmSent })
})
