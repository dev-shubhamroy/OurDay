import { describe, expect, it } from 'vitest'
import { isValidEmail, passwordStrength } from './password'
import { extractInviteCode, inviteLink, looksLikeInviteCode } from './invite'

describe('password guidance', () => {
  it('rejects short passwords and accepts 8+', () => {
    expect(passwordStrength('abc').ok).toBe(false)
    expect(passwordStrength('abcdefgh').ok).toBe(true)
  })
  it('rates longer mixed passwords higher', () => {
    expect(passwordStrength('Correct-Horse-9').score).toBeGreaterThan(passwordStrength('abcdefgh').score)
  })
  it('flags trivially weak passwords', () => {
    expect(passwordStrength('password1').score).toBeLessThanOrEqual(2)
  })
  it('validates emails', () => {
    expect(isValidEmail('a@b.co')).toBe(true)
    expect(isValidEmail('nope')).toBe(false)
  })
})

describe('invitation links', () => {
  const code = 'abcdEFGH12345678abcdEFGH12345678'
  it('extracts the code from a pasted link or bare code', () => {
    expect(extractInviteCode(inviteLink('https://ourday.app', code))).toBe(code)
    expect(extractInviteCode(`  ${code}  `)).toBe(code)
    expect(extractInviteCode(`https://x.dev/join/${code}?utm=1`)).toBe(code)
  })
  it('sanity-checks code shape', () => {
    expect(looksLikeInviteCode(code)).toBe(true)
    expect(looksLikeInviteCode('short')).toBe(false)
    expect(looksLikeInviteCode('has space in it 1234567890')).toBe(false)
  })
})
