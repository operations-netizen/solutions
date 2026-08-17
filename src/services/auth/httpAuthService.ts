/**
 * Authentication against the API server.
 *
 * Passwords are never held here: they go straight to `/api/auth/login`, which
 * returns a session token. Everything afterwards is the token. Permissions are
 * still derived on the client from the role, so the role → permission table stays
 * the single place capability rules live.
 */

import type { AuthService } from '@/services/contracts'
import type { CurrentUser, User } from '@/types/user'
import { toCurrentUser } from '@/utils/permissions'
import { authHeaders, setSessionToken } from './session'

export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

async function readError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { error?: string }
  return body.error ?? fallback
}

export function createHttpAuthService(baseUrl: string): AuthService {
  const root = baseUrl.replace(/\/$/, '')

  async function request(path: string, init?: RequestInit): Promise<Response> {
    try {
      return await fetch(`${root}${path}`, init)
    } catch {
      throw new AuthError(
        `Cannot reach the API server at ${root}. Start it with \`npm run dev:api\`.`,
      )
    }
  }

  return {
    /** Resolves the stored token to a user, or null when signed out. */
    async getCurrentUser(): Promise<CurrentUser | null> {
      const headers = authHeaders()
      if (!headers.Authorization) return null

      const response = await request('/api/auth/session', { headers })

      if (response.status === 401) {
        // Expired or revoked server-side: drop it rather than retry forever.
        setSessionToken(null)
        return null
      }
      if (!response.ok) {
        throw new AuthError(await readError(response, 'Could not restore your session.'))
      }

      const body = (await response.json()) as { user: User }
      return toCurrentUser(body.user)
    },

    async signIn(email: string, password: string): Promise<CurrentUser> {
      const response = await request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        throw new AuthError(await readError(response, 'Sign in failed. Please try again.'))
      }

      const body = (await response.json()) as { token: string; user: User }
      setSessionToken(body.token)
      return toCurrentUser(body.user)
    },

    async signOut(): Promise<void> {
      // Clear locally even if the server call fails: the user asked to leave.
      await request('/api/auth/logout', { method: 'POST', headers: authHeaders() }).catch(() => {})
      setSessionToken(null)
    },
  }
}
