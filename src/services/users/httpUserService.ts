/**
 * User directory served from MongoDB via the API.
 *
 * The five accounts are seeded into a `users` collection on first run, so the
 * directory is data rather than a hardcoded array in the bundle. Requires a
 * session — the directory is not public.
 */

import type { UserDirectory } from '@/services/contracts'
import { authHeaders } from '@/services/auth/session'
import type { Team, User } from '@/types/user'

export function createHttpUserService(baseUrl: string): UserDirectory {
  const root = baseUrl.replace(/\/$/, '')
  /** One request serves both lists, and repeat callers share the same promise. */
  let inFlight: Promise<{ users: User[]; teams: Team[] }> | null = null

  async function load(): Promise<{ users: User[]; teams: Team[] }> {
    const response = await fetch(`${root}/api/users`, { headers: authHeaders() })
    if (!response.ok) throw new Error(`The API server returned ${response.status} for /api/users.`)
    return (await response.json()) as { users: User[]; teams: Team[] }
  }

  function fetchOnce(): Promise<{ users: User[]; teams: Team[] }> {
    inFlight ??= load().finally(() => {
      // Cleared so a later call after signing in as someone else refetches.
      inFlight = null
    })
    return inFlight
  }

  return {
    async getUsers(): Promise<User[]> {
      return (await fetchOnce()).users
    },
    async getTeams(): Promise<Team[]> {
      return (await fetchOnce()).teams
    },
  }
}
