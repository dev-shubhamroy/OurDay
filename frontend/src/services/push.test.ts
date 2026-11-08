import { describe, expect, it } from 'vitest'
import { VAPID_PUBLIC_KEY, urlBase64ToBytes } from './push'

describe('push helpers', () => {
  it('decodes the VAPID public key to a 65-byte uncompressed P-256 point', () => {
    const b = urlBase64ToBytes(VAPID_PUBLIC_KEY)
    expect(b.length).toBe(65)
    expect(b[0]).toBe(4)
  })
  it('handles url-safe base64 without padding', () => {
    expect(Array.from(urlBase64ToBytes('_-8'))).toEqual([255, 239])
  })
})
