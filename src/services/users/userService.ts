/**
 * User directory.
 *
 * Standalone this reads the seed list. Inside the CRM, implement
 * `UserDirectory` against the CRM's own user endpoints and pass it to the
 * provider - the assignee and approver pickers pick up the change for free.
 */

import { MOCK_TEAMS, MOCK_USERS } from '@/data/mockUsers'
import type { UserDirectory } from '@/services/contracts'
import type { Team, User } from '@/types/user'

export const userService: UserDirectory = {
  async getUsers(): Promise<User[]> {
    return [...MOCK_USERS].sort((a, b) => a.name.localeCompare(b.name))
  },

  async getTeams(): Promise<Team[]> {
    return [...MOCK_TEAMS]
  },
}
