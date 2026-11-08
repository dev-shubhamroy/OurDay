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

  const { data: subs } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', n.user_id)
  if (!subs?.length) return json({ sent: 0 })

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
  return json({ sent })
})
