/** Accepts a pasted invitation link or a bare code and returns just the code. */
export function extractInviteCode(input: string): string {
  const v = input.trim()
  const m = v.match(/\/join\/([^/?#\s]+)/)
  return (m ? m[1] : v).trim()
}

export const inviteLink = (origin: string, code: string) => `${origin}/join/${code}`

/** Invitation codes are 32 URL-safe characters; reject obvious typos early (the server validates for real). */
export const looksLikeInviteCode = (code: string) => /^[A-Za-z0-9_-]{16,128}$/.test(code)
