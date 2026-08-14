/**
 * Authentication abstraction.
 *
 * The module asks one question - "who is the current user, and what may they
 * do?" - and does not care how that was established. Standalone, the answer is
 * the seeded HOBU. In the CRM, pass an `AuthService` backed by the CRM session,
 * or hand the provider a `currentUser` directly.
 */

import { DEFAULT_CURRENT_USER_ID, MOCK_USERS } from '@/data/mockUsers'
import type { AuthService } from '@/services/contracts'
import type { CurrentUser } from '@/types/user'
import { toCurrentUser } from '@/utils/permissions'

export const authService: AuthService = {
  async getCurrentUser(): Promise<CurrentUser> {
    const user = MOCK_USERS.find((u) => u.id === DEFAULT_CURRENT_USER_ID) ?? MOCK_USERS[0]
    return toCurrentUser(user)
  },
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
