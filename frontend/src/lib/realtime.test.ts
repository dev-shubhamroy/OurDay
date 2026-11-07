import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDebouncer } from './realtime'

describe('event debouncing (avoids duplicate handling)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('collapses a burst of events into a single refetch', () => {
    const fn = vi.fn()
    const d = createDebouncer(fn, 200)
    d.trigger()
    d.trigger()
    d.trigger()
    vi.advanceTimersByTime(199)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('can be cancelled (e.g. on unmount)', () => {
    const fn = vi.fn()
    const d = createDebouncer(fn, 200)
    d.trigger()
    d.cancel()
    vi.advanceTimersByTime(500)
    expect(fn).not.toHaveBeenCalled()
  })
})
