import { describe, expect, it } from 'vitest'
import { bundleOf, latestBundle, updateAvailable } from './appVersion'

const html = (h: string) => `<!doctype html><script type="module" crossorigin src="/assets/index-${h}.js"></script><link rel="stylesheet" href="/assets/index-xyz.css">`

describe('new-version detection', () => {
  it('reads the hashed entry bundle from index.html', () => {
    expect(bundleOf(html('D8Dg4yF2'))).toBe('/assets/index-D8Dg4yF2.js')
    expect(bundleOf('<html></html>')).toBeNull()
  })
  it('flags an update only when both are known and differ', () => {
    expect(updateAvailable('/assets/index-a.js', '/assets/index-b.js')).toBe(true)
    expect(updateAvailable('/assets/index-a.js', '/assets/index-a.js')).toBe(false)
    expect(updateAvailable(null, '/assets/index-b.js')).toBe(false)
    expect(updateAvailable('/assets/index-a.js', null)).toBe(false)
  })
  it('fetches index.html uncached and tolerates failures (offline never shows a false update)', async () => {
    let seen: RequestInit | undefined
    const ok = (async (_u: unknown, init?: RequestInit) => ((seen = init), new Response(html('new')))) as typeof fetch
    expect(await latestBundle(ok)).toBe('/assets/index-new.js')
    expect(seen?.cache).toBe('no-store')
    expect(await latestBundle((async () => { throw new TypeError('Failed to fetch') }) as typeof fetch)).toBeNull()
    expect(await latestBundle((async () => new Response('x', { status: 500 })) as typeof fetch)).toBeNull()
  })
})
