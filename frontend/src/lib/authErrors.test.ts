import { describe, expect, it } from 'vitest'
import { friendlyAuthError, friendlyWorkspaceError, isNetworkError } from './authErrors'

describe('friendly auth errors', () => {
  it('maps wrong credentials without revealing which field was wrong', () => {
    expect(friendlyAuthError({ message: 'Invalid login credentials', status: 400 })).toMatch(/don’t match/)
  })
  it('maps an existing email on registration', () => {
    expect(friendlyAuthError({ message: 'User already registered' })).toMatch(/already exists/)
  })
  it('detects network interruptions', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
    expect(friendlyAuthError({ name: 'AuthRetryableFetchError', message: 'x', status: 0 })).toMatch(/connection/)
  })
  it('handles rate limits and expired sessions', () => {
    expect(friendlyAuthError({ message: 'email rate limit exceeded', status: 429 })).toMatch(/Too many/)
    expect(friendlyAuthError({ message: 'JWT expired' })).toMatch(/expired/)
  })
  it('never echoes raw server text', () => {
    expect(friendlyAuthError({ message: 'select * from secret_table failed at 10.0.0.5' })).toBe('Something went wrong. Please try again.')
  })
})

describe('friendly workspace errors', () => {
  it.each([
    ['invalid_invitation', /isn’t valid/],
    ['invitation_expired', /expired/],
    ['invitation_used', /already been used/],
    ['workspace_full', /two members/],
    ['already_in_workspace', /already part/],
    ['own_invitation', /own workspace/],
    ['not_owner', /owner/],
  ])('%s', (code, re) => {
    expect(friendlyWorkspaceError({ message: code })).toMatch(re)
  })
})
