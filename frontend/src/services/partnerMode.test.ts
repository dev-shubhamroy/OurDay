import { describe, expect, it } from 'vitest'
import { A, B, TODAY, habit } from '../test/fixtures'
import { canManageHabit } from './habits'
import { PENDING_PARTNER_ID, pendingPartner } from './remote/mappers'
import { writeMyHabitLog, type Ctx } from './remote/data'
import { resolveMode } from './viewMode'

describe('partner habits are read-only; shared and own habits are manageable', () => {
  it('own personal habit: yes', () => expect(canManageHabit(habit({ participants: [A] }), A)).toBe(true))
  it("partner's personal habit: no", () => expect(canManageHabit(habit({ participants: [B] }), A)).toBe(false))
  it('shared habit: yes for both', () => {
    const h = habit({ participants: [A, B] })
    expect(canManageHabit(h, A)).toBe(true)
    expect(canManageHabit(h, B)).toBe(true)
  })
})

describe('mode resolution when no partner has joined', () => {
  it('falls back to My Mode even if Partner Mode was stored', () => {
    expect(resolveMode('partner', false)).toBe('me')
    expect(resolveMode('me', false)).toBe('me')
  })
  it('keeps Partner Mode once a partner exists', () => {
    expect(resolveMode('partner', true)).toBe('partner')
  })
  it('the placeholder partner has a reserved id that never equals a real profile id', () => {
    expect(pendingPartner().id).toBe(PENDING_PARTNER_ID)
    expect(PENDING_PARTNER_ID).not.toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('habit writes only ever touch the current person (real profile id)', () => {
  function fakeClient() {
    const calls: { table: string; op: string; args: unknown[]; eq: [string, unknown][] }[] = []
    const client = {
      from(table: string) {
        const rec = { table, op: '', args: [] as unknown[], eq: [] as [string, unknown][] }
        calls.push(rec)
        const chain: Record<string, unknown> = {
          delete: () => ((rec.op = 'delete'), chain),
          upsert: (...a: unknown[]) => ((rec.op = 'upsert'), (rec.args = a), Promise.resolve({ error: null })),
          eq: (c: string, v: unknown) => (rec.eq.push([c, v]), chain),
          then: (res: (v: { error: null }) => void) => res({ error: null }),
        }
        return chain
      },
    }
    return { client, calls }
  }
  const ctx = (client: unknown): Ctx => ({ client: client as Ctx['client'], workspaceId: 'ws-1', userId: A })

  it('completing writes a log row for ME only, never the partner', async () => {
    const { client, calls } = fakeClient()
    await writeMyHabitLog(ctx(client), 'h1', TODAY, 'done')
    const row = calls[0].args[0] as { user_id: string; habit_id: string; status: string }
    expect(row.user_id).toBe(A)
    expect(row.user_id).not.toBe(B)
    expect(row).toMatchObject({ habit_id: 'h1', status: 'done' })
    expect(calls[0].args[1]).toEqual({ onConflict: 'habit_id,user_id,day' })
  })

  it('undoing deletes only my row (scoped by my user id)', async () => {
    const { client, calls } = fakeClient()
    await writeMyHabitLog(ctx(client), 'h1', TODAY, null)
    expect(calls[0].op).toBe('delete')
    expect(calls[0].eq).toContainEqual(['user_id', A])
    expect(calls[0].eq).toContainEqual(['habit_id', 'h1'])
  })

  it('recording "No" at the check-in writes a missed row for me only', async () => {
    const { client, calls } = fakeClient()
    await writeMyHabitLog(ctx(client), 'h1', TODAY, 'missed')
    expect((calls[0].args[0] as { user_id: string; status: string })).toMatchObject({ user_id: A, status: 'missed' })
  })

  it('the same function with the partner\'s context writes under the partner id (ids come from the signed-in session)', async () => {
    const { client, calls } = fakeClient()
    await writeMyHabitLog({ ...ctx(client), userId: B }, 'h1', TODAY, 'done')
    expect((calls[0].args[0] as { user_id: string }).user_id).toBe(B)
  })
})
