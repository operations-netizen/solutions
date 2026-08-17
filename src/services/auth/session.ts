/**
 * Where the session token lives on the client.
 *
 * Its own module because two unrelated callers need it: the auth service that
 * obtains it, and `remoteDatabase` / attachment uploads that must attach it to
 * every request. Neither should reach into the other.
 *
 * `localStorage` rather than a cookie because the API is a separate origin and
 * the token is sent as a bearer header. That means an XSS bug could read it —
 * the mitigation is the short server-side expiry, and a deployment that needs
 * more wants an httpOnly cookie plus a same-origin proxy.
 */

const TOKEN_KEY = 'hobu.solutions.session.v1'

function available(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function getSessionToken(): string | null {
  if (!available()) return null
  try {
    return window.localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setSessionToken(token: string | null): void {
  if (!available()) return
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token)
    else window.localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Storage disabled: the session simply does not survive a reload.
  }
}

/** Authorization header for the current token, or nothing when signed out. */
export function authHeaders(): Record<string, string> {
  const token = getSessionToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}
