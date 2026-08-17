import directory from '@/data/directory.json'
import type { Team, User } from '@/types/user'

/**
 * Seed directory. Replaced wholesale by the CRM's user service at integration
 * time — nothing outside `services/users` imports this file.
 *
 * One person per role, which is the minimum that still exercises the whole
 * workflow: the HOBU raises, a developer builds, QA tests, and an approver signs
 * off at both gates.
 *
 * The records live in `directory.json` because the API server seeds the `users`
 * collection from the same file — two copies of the directory would drift the
 * first time somebody was added.
 */
export const MOCK_USERS: User[] = directory.users as User[]

export const MOCK_TEAMS: Team[] = directory.teams as Team[]

/** The signed-in principal for the standalone build. */
export const DEFAULT_CURRENT_USER_ID = 'u-hobu'
