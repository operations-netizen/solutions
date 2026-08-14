import type { Team, User } from '@/types/user'

/**
 * Seed directory. Replaced wholesale by the CRM's user service at integration
 * time — nothing outside `services/users` imports this file.
 *
 * One person per role, which is the minimum that still exercises the whole
 * workflow: the HOBU raises, a developer builds, QA tests, and an approver signs
 * off at both gates. `MOCK_TEAMS` lists exactly the teams these five belong to.
 */
export const MOCK_USERS: User[] = [
  {
    id: 'u-hobu',
    name: 'Arjun Mehta',
    email: 'arjun.mehta@hobu.example',
    role: 'HOBU',
    title: 'Head of Business Unit',
    team: 'Business Unit',
  },
  {
    id: 'u-rahul',
    name: 'Rahul Verma',
    email: 'rahul.verma@hobu.example',
    role: 'DEVELOPER',
    title: 'Senior Developer',
    team: 'Engineering',
  },
  {
    id: 'u-sarah',
    name: 'Sarah Smith',
    email: 'sarah.smith@hobu.example',
    role: 'QA',
    title: 'QA Lead',
    team: 'Quality Assurance',
  },
  {
    id: 'u-john',
    name: 'John Doe',
    email: 'john.doe@hobu.example',
    role: 'APPROVER',
    title: 'Director of Operations',
    team: 'Leadership',
  },
  {
    id: 'u-priya',
    name: 'Priya Nair',
    email: 'priya.nair@hobu.example',
    role: 'MANAGER',
    title: 'Product Manager',
    team: 'Product',
  },
]

export const MOCK_TEAMS: Team[] = [
  { id: 't-business', name: 'Business Unit' },
  { id: 't-engineering', name: 'Engineering' },
  { id: 't-qa', name: 'Quality Assurance' },
  { id: 't-leadership', name: 'Leadership' },
  { id: 't-product', name: 'Product' },
]

/** The signed-in principal for the standalone build. */
export const DEFAULT_CURRENT_USER_ID = 'u-hobu'
