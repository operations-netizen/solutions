/**
 * A dataset for showing the app to somebody.
 *
 * Not the app's default — `SEEDS` in `mockSolutions.ts` stays empty so a real
 * install starts clean. This is pushed on demand by `npm run seed:demo`, and each
 * entry is placed at a different point in the workflow so one screen shows the
 * whole pipeline: work waiting on a decision, work in flight, something overdue,
 * something delivered.
 *
 * Every row is built by the same builder the seed path uses, so the approval
 * trail, history and chat are consistent with the state machine rather than
 * invented.
 */

import { buildSnapshotFrom, type DatabaseSnapshot, type SolutionSeed } from './mockSolutions'

const DEMO_SEEDS: SolutionSeed[] = [
  {
    title: 'Quote approval takes four days',
    problem:
      'A quote above 50k needs sign-off from the account manager, finance and the unit head. Today that happens over email, so nobody can say whose desk it is on, and the average is four days.',
    proposedSolution:
      'Move quote approval into the tracker: one roster, two gates, and a due date. The salesperson sees who has signed and who has not.',
    description:
      'Phase one covers quotes only. Renewals stay on the current process until the numbers show this is faster.',
    priority: 'CRITICAL',
    status: 'DISCUSSION_APPROVAL',
    assignedUserId: 'u-rahul',
    assignedTeam: 'Engineering',
    createdDaysAgo: 6,
    dueInDays: 9,
    approverIds: ['u-john', 'u-mark'],
    partiallyApproved: true,
    chat: [
      { userId: 'u-hobu', message: 'Finance needs to be on this gate as well as Leadership.', hoursAgo: 120 },
      { userId: 'u-rahul', message: 'Added Mark. The 50k threshold comes from the pricing sheet, not hardcoded.', hoursAgo: 96 },
    ],
  },
  {
    title: 'Duplicate contacts on import',
    problem:
      'The nightly import matches on email only, so a contact who changes address is created a second time. Sales has flagged 300 duplicates this quarter.',
    proposedSolution:
      'Match on email, then on phone plus company name, and hold anything ambiguous in a review queue instead of guessing.',
    description: 'The review queue is the part that needs a decision: who works it, and how often.',
    priority: 'HIGH',
    status: 'DEVELOPMENT',
    assignedUserId: 'u-rahul',
    assignedTeam: 'Engineering',
    createdDaysAgo: 12,
    dueInDays: 5,
    approverIds: ['u-john', 'u-sarah'],
    rejectedOnceAt: 'DISCUSSION_APPROVAL',
    rejectionReason: 'Needs a rollback plan before anything touches live contacts.',
    chat: [
      { userId: 'u-sarah', message: 'I want the review queue covered by tests before this reaches Testing.', hoursAgo: 72 },
    ],
  },
  {
    title: 'Renewal reminders go out late',
    problem:
      'Reminders are sent by a monthly job, so a contract renewing on the 2nd is chased on the 1st. Two renewals lapsed last quarter.',
    proposedSolution: 'Schedule per contract: 60, 30 and 7 days before the renewal date.',
    description: 'Reuses the notification service already in the tracker.',
    priority: 'MEDIUM',
    status: 'TESTING_APPROVAL',
    assignedUserId: 'u-sarah',
    assignedTeam: 'Quality Assurance',
    createdDaysAgo: 21,
    dueInDays: 3,
    approverIds: ['u-john'],
    chat: [{ userId: 'u-sarah', message: 'Tested across a month boundary and a leap year.', hoursAgo: 24 }],
  },
  {
    title: 'Territory rules are a spreadsheet',
    problem:
      'Which rep owns which account is decided by a spreadsheet three people can edit. Two reps called the same account last week.',
    proposedSolution: 'Put territory rules in the CRM with an owner per rule and a history of changes.',
    description: 'Overdue: the spreadsheet owner left and nobody picked this up.',
    priority: 'HIGH',
    status: 'DEVELOPMENT',
    assignedUserId: 'u-priya',
    assignedTeam: 'Product',
    createdDaysAgo: 40,
    dueInDays: -6,
    approverIds: ['u-john', 'u-mark'],
  },
  {
    title: 'Lead routing by round robin',
    problem: 'Inbound leads were assigned by whoever saw them first, so response time depended on who was online.',
    proposedSolution: 'Round robin within a territory, skipping anyone on leave.',
    description: 'Delivered and in use since last month.',
    priority: 'MEDIUM',
    status: 'COMPLETED',
    assignedUserId: 'u-rahul',
    assignedTeam: 'Engineering',
    createdDaysAgo: 34,
    dueInDays: -20,
    approverIds: ['u-john'],
    chat: [{ userId: 'u-hobu', message: 'Response time is down from 6 hours to under one. Closing this.', hoursAgo: 192 }],
  },
]

export function createDemoSnapshot(): DatabaseSnapshot {
  return buildSnapshotFrom(DEMO_SEEDS)
}
