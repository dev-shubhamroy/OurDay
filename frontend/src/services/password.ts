export const MIN_PASSWORD_LENGTH = 8

export interface Strength {
  /** 0 (empty) .. 4 (strong) */
  score: 0 | 1 | 2 | 3 | 4
  label: string
  /** True when the password is acceptable to submit. */
  ok: boolean
  hint: string
}

/** Simple, dependency-free guidance (not a security guarantee). */
export function passwordStrength(pw: string): Strength {
  if (!pw) return { score: 0, label: '', ok: false, hint: `Use at least ${MIN_PASSWORD_LENGTH} characters.` }
  if (pw.length < MIN_PASSWORD_LENGTH) return { score: 1, label: 'Too short', ok: false, hint: `Use at least ${MIN_PASSWORD_LENGTH} characters.` }
  let points = 0
  if (pw.length >= 12) points++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) points++
  if (/\d/.test(pw)) points++
  if (/[^A-Za-z0-9]/.test(pw)) points++
  if (/^(.)\1+$/.test(pw) || /^(password|12345678|qwertyui)/i.test(pw)) points = 0
  const score = (points <= 1 ? 2 : points === 2 ? 3 : 4) as 2 | 3 | 4
  const label = score === 2 ? 'Okay' : score === 3 ? 'Good' : 'Strong'
  const hint = score === 2 ? 'Add a mix of cases, numbers or symbols, or make it longer.' : score === 3 ? 'Nice. A little longer would make it stronger.' : 'Great password.'
  return { score, label, ok: true, hint }
}

export const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())
