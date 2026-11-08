import type { SupabaseClient } from '@supabase/supabase-js'

/** Public by design (it only identifies the sender to the push service); the private key lives in Supabase secrets. */
export const VAPID_PUBLIC_KEY: string = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim() || 'BFjBjt4iIcTubPu9GNuY96K78YBH4z2ypkPGZpbe_w20EmPFkdjVHCckfWqFKK6j86rwfPUGmsl0IrJcBdpT79M'

export type PushState = 'unsupported' | 'needs-install' | 'blocked' | 'off' | 'on'

export const urlBase64ToBytes = (b64: string): Uint8Array<ArrayBuffer> => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export const pushSupported = (): boolean => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  return (await navigator.serviceWorker.getRegistration('/')) ?? (await navigator.serviceWorker.ready.catch(() => null))
}

/** Where this device stands: whether the browser can do push, whether permission was refused, whether it's subscribed. */
export async function currentPushState(): Promise<PushState> {
  if (!pushSupported()) return isIos() && !standalone() ? 'needs-install' : 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  const reg = await registration()
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

export type EnableResult = { ok: true } | { ok: false; reason: 'denied' | 'unsupported' | 'error'; message: string }

/** Must be called from a tap (browsers require a user gesture for the permission prompt). */
export async function enablePush(client: SupabaseClient, userId: string): Promise<EnableResult> {
  if (!pushSupported()) return { ok: false, reason: 'unsupported', message: 'This browser can’t receive background notifications.' }
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return { ok: false, reason: 'denied', message: 'Notifications are blocked. Allow them in the browser or Android app settings, then try again.' }
  try {
    const reg = await registration()
    if (!reg) return { ok: false, reason: 'unsupported', message: 'The app isn’t ready for notifications yet. Reload and try again.' }
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(VAPID_PUBLIC_KEY) }))
    const j = sub.toJSON()
    if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) throw new Error('incomplete subscription')
    const { error } = await client.from('push_subscriptions').upsert({ user_id: userId, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 300) }, { onConflict: 'endpoint' })
    if (error) throw error
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: 'error', message: e instanceof Error && /fetch|network/i.test(e.message) ? 'No connection. Try again when you’re online.' : 'Couldn’t turn on notifications. Please try again.' }
  }
}

export async function disablePush(client: SupabaseClient): Promise<void> {
  const reg = await registration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await client.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

/** Local display test (checks permission + the service worker), NOT a test of background delivery. */
export async function showLocalTest(): Promise<boolean> {
  const reg = await registration()
  if (!reg || Notification.permission !== 'granted') return false
  await reg.showNotification('OurDay test', { body: 'Notifications can be shown on this device.', icon: '/icons/icon-192.png', badge: '/icons/favicon-32.png', tag: 'ourday-test' })
  return true
}
