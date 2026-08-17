/**
 * Pure derivations over solution data — no I/O, no React.
 *
 * The service layer runs these before handing data to the UI, so components
 * receive `isOverdue` / `approvalStatus` / `progress` ready-made and never
 * recompute business rules themselves.
 */

import type {
  Approval,
  ApprovalStage,
  ApprovalStatus,
  Solution,
  SolutionFilters,
  SolutionPriority,
  SolutionSortKey,
  SolutionStatus,
  SolutionWithMeta,
} from '@/types/solution'
import type { User } from '@/types/user'
import { daysFromToday } from './format'
import {
  isApprovalGate,
  PHASE_STATUSES,
  SOLUTION_PHASES,
  statusProgress,
  type SolutionPhase,
} from './workflow'

/** A solution is flagged "due soon" this many days before its due date. */
export const DUE_SOON_DAYS = 7

/* ------------------------------------------------------------------ */
/* Priority                                                            */
/* ------------------------------------------------------------------ */

export interface PriorityMeta {
  label: string
  badgeClass: string
  dotClass: string
  /** Higher sorts first. */
  weight: number
}

export const PRIORITY_META: Record<SolutionPriority, PriorityMeta> = {
  LOW: {
    label: 'Low',
    badgeClass: 'bg-slate-100 text-slate-600 ring-slate-200',
    dotClass: 'bg-slate-400',
    weight: 1,
  },
  MEDIUM: {
    label: 'Medium',
    badgeClass: 'bg-sky-100 text-sky-700 ring-sky-200',
    dotClass: 'bg-sky-500',
    weight: 2,
  },
  HIGH: {
    label: 'High',
    badgeClass: 'bg-orange-100 text-orange-700 ring-orange-200',
    dotClass: 'bg-orange-500',
    weight: 3,
  },
  CRITICAL: {
    label: 'Critical',
    badgeClass: 'bg-red-100 text-red-700 ring-red-200',
    dotClass: 'bg-red-500',
    weight: 4,
  },
}

/**
 * `NOT_REQUIRED` keeps its name in the domain — it is the absence of a decision —
 * but reads as "No decision yet" wherever it is shown, because in this workflow
 * nearly every solution does eventually need one. `ApprovalStatusBadge` narrows
 * it further to "Not yet" when approvers are already on the roster.
 */
export const APPROVAL_STATUS_META: Record<ApprovalStatus, { label: string; badgeClass: string }> = {
  NOT_REQUIRED: {
    label: 'No decision yet',
    badgeClass: 'bg-slate-100 text-slate-500 ring-slate-200',
  },
  PENDING: {
    label: 'Waiting for approval',
    badgeClass: 'bg-amber-100 text-amber-800 ring-amber-200',
  },
  APPROVED: { label: 'Approved', badgeClass: 'bg-emerald-100 text-emerald-700 ring-emerald-200' },
  REJECTED: { label: 'Rejected', badgeClass: 'bg-red-100 text-red-700 ring-red-200' },
}

/* ------------------------------------------------------------------ */
/* Derivations                                                         */
/* ------------------------------------------------------------------ */

/**
 * Roll up a solution's approval situation.
 *
 * At a gate the status reflects the outstanding decisions. Away from a gate it
 * reflects the most recent decision, which is what the "Approval status"
 * column is asking about.
 */
export function deriveApprovalState(
  solution: Pick<Solution, 'status'>,
  approvals: Approval[],
): { approvalStatus: ApprovalStatus; pendingStage: ApprovalStage | null } {
  const pendingStage: ApprovalStage | null = isApprovalGate(solution.status) ? solution.status : null

  if (pendingStage) {
    const forStage = approvals.filter((a) => a.stage === pendingStage)
    if (forStage.some((a) => a.status === 'REJECTED')) {
      return { approvalStatus: 'REJECTED', pendingStage }
    }
    if (forStage.length > 0 && forStage.every((a) => a.status === 'APPROVED')) {
      return { approvalStatus: 'APPROVED', pendingStage }
    }
    return { approvalStatus: 'PENDING', pendingStage }
  }

  const lastDecision = approvals
    .filter((a) => a.status !== 'PENDING' && a.approvedAt)
    .sort((a, b) => (a.approvedAt! < b.approvedAt! ? 1 : -1))[0]

  if (!lastDecision) return { approvalStatus: 'NOT_REQUIRED', pendingStage: null }
  return {
    approvalStatus: lastDecision.status === 'REJECTED' ? 'REJECTED' : 'APPROVED',
    pendingStage: null,
  }
}

/** Completed solutions are never overdue, however late they finished. */
export function isSolutionOverdue(solution: Pick<Solution, 'status' | 'dueDate'>): boolean {
  if (solution.status === 'COMPLETED') return false
  const days = daysFromToday(solution.dueDate)
  return days !== null && days < 0
}

/** Attach every computed field the UI needs. */
export function withMeta(
  solution: Solution,
  parts: {
    approvals: Approval[]
    attachmentCount: number
    commentCount: number
  },
): SolutionWithMeta {
  const { approvalStatus, pendingStage } = deriveApprovalState(solution, parts.approvals)
  return {
    ...solution,
    approvals: parts.approvals,
    approvalStatus,
    pendingStage,
    isOverdue: isSolutionOverdue(solution),
    daysUntilDue: solution.status === 'COMPLETED' ? null : daysFromToday(solution.dueDate),
    progress: statusProgress(solution.status),
    attachmentCount: parts.attachmentCount,
    commentCount: parts.commentCount,
  }
}

export function isDueSoon(solution: Pick<SolutionWithMeta, 'daysUntilDue' | 'status'>): boolean {
  if (solution.status === 'COMPLETED' || solution.daysUntilDue === null) return false
  return solution.daysUntilDue >= 0 && solution.daysUntilDue <= DUE_SOON_DAYS
}

/**
 * Whether this person still owes a decision at the gate the solution is sitting
 * on — not merely that they are somewhere on its approver roster.
 *
 * `SolutionWithMeta` already carries every approval row, so this needs no extra
 * request and no new service method: a personal queue is derived from the same
 * list every other screen uses.
 */
export function awaitsApprovalFrom(
  solution: Pick<SolutionWithMeta, 'pendingStage' | 'approvals'>,
  userId: string,
): boolean {
  const { pendingStage } = solution
  if (pendingStage === null) return false
  return solution.approvals.some(
    (approval) =>
      approval.stage === pendingStage &&
      approval.approverId === userId &&
      approval.status === 'PENDING',
  )
}

/* ------------------------------------------------------------------ */
/* Query: search, filter, sort                                         */
/* ------------------------------------------------------------------ */

/**
 * Human labels for the sort keys. The toolbar's sort menu needs these because
 * not every key has a column to click: `createdAt` has none at any width, and
 * `updatedAt` gives its column up below `2xl`.
 */
export const SORT_LABELS: Record<SolutionSortKey, string> = {
  updatedAt: 'Last updated',
  createdAt: 'Date created',
  dueDate: 'Due date',
  priority: 'Priority',
  assignee: 'Assigned to',
  raiser: 'Assigned by',
  solutionNumber: 'Solution ID',
  title: 'Title',
}

/** The status tabs on the Solutions page. */
/*
  The four phases run in workflow order, then the two cross-cutting tabs.

  "Pending Approval" is not a stage — it selects whatever is sitting at a gate,
  wherever that gate is — so it sat oddly between Discussion and Development,
  reading like a step between them. It belongs after the stages it cuts across.
*/
export const STATUS_TABS = [
  { key: 'ALL', label: 'All' },
  { key: 'DISCUSSION', label: 'Discussion' },
  { key: 'DEVELOPMENT', label: 'Development' },
  { key: 'TESTING', label: 'Testing' },
  { key: 'EXECUTION', label: 'Execution' },
  { key: 'PENDING_APPROVAL', label: 'Pending Approval' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'VOID', label: 'Void' },
] as const

export type StatusTabKey = (typeof STATUS_TABS)[number]['key']

/**
 * Search across solution number, title, and the assignee's name.
 * `userLookup` keeps this pure — no store access from inside the matcher.
 */
function matchesSearch(
  solution: SolutionWithMeta,
  term: string,
  userLookup: Map<string, User>,
): boolean {
  const needle = term.trim().toLowerCase()
  if (!needle) return true
  const assignee = userLookup.get(solution.assignedUserId)?.name ?? ''
  return (
    solution.solutionNumber.toLowerCase().includes(needle) ||
    solution.title.toLowerCase().includes(needle) ||
    assignee.toLowerCase().includes(needle) ||
    solution.assignedTeam.toLowerCase().includes(needle)
  )
}

function matchesBucket(solution: SolutionWithMeta, bucket: SolutionFilters['bucket']): boolean {
  switch (bucket) {
    case 'PENDING_APPROVAL':
      return solution.pendingStage !== null
    case 'OVERDUE':
      return solution.isOverdue
    case 'ACTIVE':
      return solution.status !== 'COMPLETED'
    default:
      return true
  }
}

/**
 * Whether somebody is looped into a solution.
 *
 * Three ways in: it is assigned to them, they raised it, or they are on its
 * approver roster. Commenting on one does not count — being asked a question is
 * not the same as being given the work.
 */
export function isParticipant(solution: SolutionWithMeta, userId: string): boolean {
  return (
    solution.assignedUserId === userId ||
    solution.createdBy === userId ||
    solution.approvals.some((approval) => approval.approverId === userId)
  )
}

export function filterSolutions(
  solutions: SolutionWithMeta[],
  filters: SolutionFilters,
  users: User[],
): SolutionWithMeta[] {
  const userLookup = new Map(users.map((u) => [u.id, u]))

  return solutions.filter((solution) => {
    if (filters.participantId && !isParticipant(solution, filters.participantId)) return false
    if (!matchesSearch(solution, filters.search ?? '', userLookup)) return false
    if (!matchesBucket(solution, filters.bucket)) return false
    // `status` accepts a list so a phase — a stage plus its approval gate — can
    // be selected with one filter, and the rows then match the phase counts.
    if (filters.status && filters.status !== 'ALL') {
      const allowed = Array.isArray(filters.status) ? filters.status : [filters.status]
      if (!allowed.includes(solution.status)) return false
    }
    if (filters.priority && filters.priority !== 'ALL' && solution.priority !== filters.priority) {
      return false
    }
    if (
      filters.assignedUserId &&
      filters.assignedUserId !== 'ALL' &&
      solution.assignedUserId !== filters.assignedUserId
    ) {
      return false
    }
    if (
      filters.approvalStatus &&
      filters.approvalStatus !== 'ALL' &&
      solution.approvalStatus !== filters.approvalStatus
    ) {
      return false
    }
    if (filters.dueFrom && solution.dueDate < filters.dueFrom) return false
    // `dueTo` is inclusive of the whole day.
    if (filters.dueTo && solution.dueDate > `${filters.dueTo}T23:59:59.999Z`) return false
    return true
  })
}

export function sortSolutions(
  solutions: SolutionWithMeta[],
  sortBy: SolutionFilters['sortBy'] = 'updatedAt',
  sortDir: SolutionFilters['sortDir'] = 'desc',
  /** Needed only by the `assignee` key, which sorts by name rather than by id. */
  users: User[] = [],
): SolutionWithMeta[] {
  const direction = sortDir === 'asc' ? 1 : -1
  const nameFor = new Map(users.map((user) => [user.id, user.name]))

  return [...solutions].sort((a, b) => {
    let result = 0
    switch (sortBy) {
      case 'priority':
        result = PRIORITY_META[a.priority].weight - PRIORITY_META[b.priority].weight
        break
      case 'title':
        result = a.title.localeCompare(b.title)
        break
      case 'solutionNumber':
        result = a.solutionNumber.localeCompare(b.solutionNumber)
        break
      /*
        By display name, not `assignedUserId`: sorting by an opaque id would
        order the column by something the reader cannot see. An unresolved id
        falls back to itself so the sort is still total.
      */
      case 'assignee':
        result = (nameFor.get(a.assignedUserId) ?? a.assignedUserId).localeCompare(
          nameFor.get(b.assignedUserId) ?? b.assignedUserId,
        )
        break
      case 'raiser':
        result = (nameFor.get(a.createdBy) ?? a.createdBy).localeCompare(
          nameFor.get(b.createdBy) ?? b.createdBy,
        )
        break
      default:
        result = a[sortBy].localeCompare(b[sortBy])
    }
    // Stable tiebreak so equal keys never reshuffle between renders.
    return result !== 0 ? result * direction : a.solutionNumber.localeCompare(b.solutionNumber)
  })
}

/** Next sequential id, e.g. `SOL-025`. */
export function nextSolutionNumber(existing: Pick<Solution, 'solutionNumber'>[]): string {
  const highest = existing.reduce((max, solution) => {
    const match = /^SOL-(\d+)$/.exec(solution.solutionNumber)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)
  return `SOL-${String(highest + 1).padStart(3, '0')}`
}

/** Sort helper for status counts on the dashboard. */
/**
 * Fold raw status counts into phase counts, so a solution parked at a gate is
 * counted under the work it belongs to rather than vanishing from every stage.
 * The five phases are exhaustive and non-overlapping, so these still sum to the
 * total — which is what lets the tiles and the donut reconcile.
 */
export function foldToPhases(
  byStatus: Record<SolutionStatus, number>,
): Record<SolutionPhase, number> {
  const counts = {} as Record<SolutionPhase, number>
  for (const phase of SOLUTION_PHASES) {
    /*
      `?? 0` per status, because the argument is not always as complete as its
      type claims: a cached stats payload written by an earlier build has no
      count for a status added since, and `undefined + 0` is NaN — which then
      spreads to every total derived from it and cannot be caught downstream,
      since NaN is neither null nor undefined.
    */
    counts[phase] = PHASE_STATUSES[phase].reduce(
      (sum, status) => sum + (byStatus[status] ?? 0),
      0,
    )
  }
  return counts
}

export function countByStatus(solutions: SolutionWithMeta[]): Record<SolutionStatus, number> {
  const counts = {
    DISCUSSION: 0,
    DISCUSSION_APPROVAL: 0,
    DEVELOPMENT: 0,
    DEVELOPMENT_APPROVAL: 0,
    TESTING: 0,
    TESTING_APPROVAL: 0,
    EXECUTION: 0,
    EXECUTION_APPROVAL: 0,
    COMPLETED: 0,
    VOID: 0,
  } satisfies Record<SolutionStatus, number>

  for (const solution of solutions) counts[solution.status] += 1
  return counts
}
