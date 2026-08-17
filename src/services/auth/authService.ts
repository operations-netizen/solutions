/**
 * Authentication abstraction.
 *
 * The module asks one question - "who is the current user, and what may they
 * do?" - and does not care how that was established. Standalone, the answer is
 * the seeded HOBU. In the CRM, pass an `AuthService` backed by the CRM session,
 * or hand the provider a `currentUser` directly.
 */

import { DEFAULT_CURRENT_USER_ID, MOCK_USERS } from '@/data/mockUsers'
import { DEMO_MODE, DEMO_MODE_PASSWORD } from '@/services/demoMode'
import type { AuthService } from '@/services/contracts'
import type { CurrentUser } from '@/types/user'
import { toCurrentUser } from '@/utils/permissions'

/** Which demo account is signed in. Survives a reload, like a real session. */
const DEMO_SESSION_KEY = 'hobu.solutions.demo-user.v1'

function readDemoSession(): string | null {
  try {
    return window.localStorage.getItem(DEMO_SESSION_KEY)
  } catch {
    return null
  }
}

/**
 * Standalone authentication.
 *
 * Without a server there is nothing to verify a password against, so a demo build
 * checks the shared demo password against the directory in the bundle and
 * remembers the choice. This is deliberately not a security boundary — it exists
 * so a static demo behaves like the real thing: the same sign-in screen, the same
 * accounts, and the same difference between what an approver and a viewer can do.
 *
 * Outside demo mode the answer stays what it always was: the seeded HOBU, no
 * sign-in screen, which is what a CRM host embedding this module wants.
 */
export const authService: AuthService = {
  async getCurrentUser(): Promise<CurrentUser | null> {
    if (DEMO_MODE) {
      const id = readDemoSession()
      if (!id) return null
      const signedIn = MOCK_USERS.find((user) => user.id === id)
      if (signedIn) return toCurrentUser(signedIn)
    }

    const user = MOCK_USERS.find((u) => u.id === DEFAULT_CURRENT_USER_ID) ?? MOCK_USERS[0]
    return toCurrentUser(user)
  },

  ...(DEMO_MODE
    ? {
        async signIn(email: string, password: string): Promise<CurrentUser> {
          const user = MOCK_USERS.find(
            (candidate) => candidate.email.toLowerCase() === email.trim().toLowerCase(),
          )
          // One message for both failures, as the API does: telling a stranger
          // which addresses exist is a courtesy to the wrong person.
          if (!user || password !== DEMO_MODE_PASSWORD) {
            throw new Error('That email and password do not match an account.')
          }
          window.localStorage.setItem(DEMO_SESSION_KEY, user.id)
          return toCurrentUser(user)
        },

        async signOut(): Promise<void> {
          window.localStorage.removeItem(DEMO_SESSION_KEY)
        },
      }
    : {}),
}

/**
 * Build an `AuthService` around a user the host already has in hand.
 * The one-liner the CRM is expected to use.
 */
export function createStaticAuthService(user: CurrentUser): AuthService {
  return {
    async getCurrentUser() {
      return user
    },
  }
}
