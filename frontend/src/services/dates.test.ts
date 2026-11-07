import { describe, expect, it } from 'vitest'
import { format12, formatClock, formatTime, fromParts, toParts } from './dates'

const plain = (s: string) => s.replace(/ /g, ' ')

describe('12-hour display', () => {
  it.each([
    ['00:00', '12:00 AM'],
    ['00:30', '12:30 AM'],
    ['09:30', '9:30 AM'],
    ['11:59', '11:59 AM'],
    ['12:00', '12:00 PM'],
    ['14:25', '2:25 PM'],
    ['20:45', '8:45 PM'],
    ['23:59', '11:59 PM'],
  ])('%s -> %s', (hhmm, expected) => {
    expect(plain(formatClock(hhmm))).toBe(expected)
  })

  it('formats timestamps in local time', () => {
    expect(plain(formatTime(new Date(2026, 10, 7, 0, 0)))).toBe('12:00 AM')
    expect(plain(format12(12, 0))).toBe('12:00 PM')
  })

  it('round-trips every minute of the day through the picker form', () => {
    for (let h = 0; h < 24; h++)
      for (let m = 0; m < 60; m++) {
        const k = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
        expect(fromParts(toParts(k))).toBe(k)
      }
  })
})
