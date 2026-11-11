/**
 * Detects that a newer build has been deployed while this page is still open. Needed because a long-lived page (the Mac
 * dashboard window, an installed PWA that is never closed) keeps running the JavaScript it first loaded. Every build has
 * a content-hashed entry bundle, so "the bundle named in the live index.html differs from the one running" = new version.
 */
const BUNDLE = /\/assets\/index-[A-Za-z0-9_-]+\.js/

export const bundleOf = (html: string): string | null => html.match(BUNDLE)?.[0] ?? null

export const updateAvailable = (running: string | null, latest: string | null): boolean => !!running && !!latest && running !== latest

export function runningBundle(doc: Document = document): string | null {
  const src = doc.querySelector('script[type="module"][src*="/assets/index-"]')?.getAttribute('src') ?? null
  return src ? (src.match(BUNDLE)?.[0] ?? null) : null
}

/** The bundle named by the live index.html, or null if it can't be read (offline, error): never throws. */
export async function latestBundle(fetchFn: typeof fetch = fetch): Promise<string | null> {
  try {
    const r = await fetchFn('/index.html', { cache: 'no-store' })
    return r.ok ? bundleOf(await r.text()) : null
  } catch {
    return null
  }
}
