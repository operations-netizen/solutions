/**
 * Local implementation of `SolutionService`.
 *
 * All workflow rules live here and in `utils/workflow`. Every status change is
 * validated by the state machine, every write appends to the history trail, and
 * nothing mutates a solution's status without going through one of these
 * methods.
 */

import type { DatabaseSnapshot } from '@/data/mockSolutions'
import { MOCK_USERS } from '@/data/mockUsers'
import type {
  ActorContext,
  AddApproverInput,
  ApproveInput,
  RejectInput,
  SolutionService,
} from '@/services/contracts'
import { db } from '@/services/db'
import type {
  Approval,
  ApprovalStage,
  CreateSolutionInput,
  History,
  HistoryAction,
  Solution,
  SolutionDetail,
  SolutionFilters,
  SolutionStats,
  SolutionStatus,
  SolutionWithMeta,
  UpdateSolutionInput,
} from '@/types/solution'
import { formatDate } from '@/utils/format'
import { createId } from '@/utils/id'
import {
  countByStatus,
  filterSolutions,
  isDueSoon,
  nextSolutionNumber,
  PRIORITY_META,
  sortSolutions,
  withMeta,
} from '@/utils/solution'
import {
  assertTransition,
  getApprovalTarget,
  getRejectionTarget,
  isApprovalGate,
  statusIndex,
  statusLabel,
} from '@/utils/workflow'

const ALL_STAGES: ApprovalStage[] = ['DISCUSSION_APPROVAL', 'TESTING_APPROVAL']

/** Raised for rule violations that are the user's problem, not a bug. */
export class SolutionServiceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SolutionServiceError'
  }
}

/* ------------------------------------------------------------------ */
/* Internal helpers (operate on a live snapshot inside a transaction)  */
/* ------------------------------------------------------------------ */

function requireSolution(draft: DatabaseSnapshot, id: string): Solution {
  const solution = draft.solutions.find((s) => s.id === id)
  if (!solution) throw new SolutionServiceError(`Solution ${id} was not found.`)
  return solution
}

function appendHistory(
  draft: DatabaseSnapshot,
  entry: {
    solutionId: string
    action: HistoryAction
    fromStatus?: SolutionStatus | null
    toStatus?: SolutionStatus | null
    description: string
    performedBy: string
  },
): History {
  const record: History = {
    id: createId('his'),
    solutionId: entry.solutionId,
    action: entry.action,
    fromStatus: entry.fromStatus ?? null,
    toStatus: entry.toStatus ?? null,
    description: entry.description,
    performedBy: entry.performedBy,
    createdAt: new Date().toISOString(),
  }
  draft.history.push(record)
  return record
}

function touch(solution: Solution): void {
  solution.updatedAt = new Date().toISOString()
}

function assemble(draft: DatabaseSnapshot, solution: Solution): SolutionWithMeta {
  return withMeta(solution, {
    approvals: draft.approvals.filter((a) => a.solutionId === solution.id),
    attachmentCount: draft.attachments.filter((a) => a.solutionId === solution.id).length,
    commentCount: draft.comments.filter((c) => c.solutionId === solution.id).length,
  })
}

function userName(userId: string): string {
  return MOCK_USERS.find((u) => u.id === userId)?.name ?? userId
}

/**
 * A solution is assigned to a person, and the team follows from that person —
 * it is never entered separately, so this is the only place it is decided.
 */
function userTeam(userId: string): string {
  return MOCK_USERS.find((u) => u.id === userId)?.team ?? ''
}

/** Approver roster for a stage, in the order they were added. */
function approvalsForStage(
  draft: DatabaseSnapshot,
  solutionId: string,
  stage: ApprovalStage,
): Approval[] {
  return draft.approvals.filter((a) => a.solutionId === solutionId && a.stage === stage)
}

/**
 * Clear decisions on a gate so it can be re-run after a rejection.
 * The historical record of the rejection stays in the timeline.
 */
function resetStage(draft: DatabaseSnapshot, solutionId: string, stage: ApprovalStage): void {
  for (const approval of approvalsForStage(draft, solutionId, stage)) {
    approval.status = 'PENDING'
    approval.comment = null
    approval.approvedAt = null
  }
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

export const solutionService: SolutionService = {
  async getSolutions(filters: SolutionFilters = {}): Promise<SolutionWithMeta[]> {
    const draft = await db.read()
    const enriched = draft.solutions.map((solution) => assemble(draft, solution))
    const filtered = filterSolutions(enriched, filters, MOCK_USERS)
    return sortSolutions(filtered, filters.sortBy, filters.sortDir)
  },

  async getSolution(id: string): Promise<SolutionDetail> {
    const draft = await db.read()
    const solution = draft.solutions.find((s) => s.id === id)
    if (!solution) throw new SolutionServiceError(`Solution ${id} was not found.`)

    const byOldestFirst = (a: { createdAt: string }, b: { createdAt: string }) =>
      a.createdAt.localeCompare(b.createdAt)

    return {
      ...assemble(draft, solution),
      history: draft.history.filter((h) => h.solutionId === id).sort(byOldestFirst),
      comments: draft.comments.filter((c) => c.solutionId === id).sort(byOldestFirst),
      attachments: draft.attachments.filter((a) => a.solutionId === id).sort(byOldestFirst),
    }
  },

  async createSolution(input: CreateSolutionInput, ctx: ActorContext): Promise<SolutionWithMeta> {
    if (input.approverIds.length === 0) {
      throw new SolutionServiceError('At least one approver must be selected.')
    }

    return db.transact((draft) => {
      const now = new Date().toISOString()
      const solution: Solution = {
        id: createId('sol'),
        solutionNumber: nextSolutionNumber(draft.solutions),
        title: input.title.trim(),
        problem: input.problem.trim(),
        proposedSolution: input.proposedSolution.trim(),
        description: input.description?.trim() ?? '',
        priority: input.priority,
        status: 'DISCUSSION', // Always. There is no other legal starting state.
        assignedUserId: input.assignedUserId,
        assignedTeam: userTeam(input.assignedUserId),
        dueDate: input.dueDate,
        createdBy: ctx.actorId,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      }
      draft.solutions.push(solution)

      appendHistory(draft, {
        solutionId: solution.id,
        action: 'CREATED',
        toStatus: 'DISCUSSION',
        description: `Solution created by ${userName(ctx.actorId)}`,
        performedBy: ctx.actorId,
      })

      // One pending approval row per approver per gate. The roster is fixed at
      // creation; rows simply become actionable when a gate is reached.
      for (const approverId of input.approverIds) {
        for (const stage of ALL_STAGES) {
          draft.approvals.push({
            id: createId('apr'),
            solutionId: solution.id,
            approverId,
            stage,
            status: 'PENDING',
            comment: null,
            createdAt: now,
            approvedAt: null,
          })
        }
        appendHistory(draft, {
          solutionId: solution.id,
          action: 'APPROVER_ADDED',
          description: `Approver added: ${userName(approverId)}`,
          performedBy: ctx.actorId,
        })
      }

      for (const file of input.attachments ?? []) {
        draft.attachments.push({
          id: createId('att'),
          solutionId: solution.id,
          fileName: file.fileName,
          fileUrl: file.fileUrl,
          fileSize: file.fileSize,
          mimeType: file.mimeType,
          uploadedBy: ctx.actorId,
          createdAt: now,
        })
        appendHistory(draft, {
          solutionId: solution.id,
          action: 'ATTACHMENT_UPLOADED',
          description: `Attachment uploaded: ${file.fileName}`,
          performedBy: ctx.actorId,
        })
      }

      return assemble(draft, solution)
    })
  },

  async updateSolution(
    id: string,
    data: UpdateSolutionInput,
    ctx: ActorContext,
  ): Promise<SolutionWithMeta> {
    return db.transact((draft) => {
      const solution = requireSolution(draft, id)

      if (solution.status === 'COMPLETED') {
        throw new SolutionServiceError('Completed solutions are read-only and cannot be edited.')
      }

      // Log each meaningful field change on its own timeline entry.
      if (data.assignedUserId && data.assignedUserId !== solution.assignedUserId) {
        appendHistory(draft, {
          solutionId: id,
          action: 'ASSIGNED',
          description: `Reassigned from ${userName(solution.assignedUserId)} to ${userName(data.assignedUserId)}`,
          performedBy: ctx.actorId,
        })
        solution.assignedUserId = data.assignedUserId
        // Reassigning moves the solution to the new owner's team with them.
        solution.assignedTeam = userTeam(data.assignedUserId)
      }

      if (data.dueDate && data.dueDate !== solution.dueDate) {
        appendHistory(draft, {
          solutionId: id,
          action: 'DUE_DATE_CHANGED',
          description: `Due date changed from ${formatDate(solution.dueDate)} to ${formatDate(data.dueDate)}`,
          performedBy: ctx.actorId,
        })
        solution.dueDate = data.dueDate
      }

      if (data.priority && data.priority !== solution.priority) {
        appendHistory(draft, {
          solutionId: id,
          action: 'PRIORITY_CHANGED',
          description: `Priority changed from ${PRIORITY_META[solution.priority].label} to ${PRIORITY_META[data.priority].label}`,
          performedBy: ctx.actorId,
        })
        solution.priority = data.priority
      }

      const textFields = ['title', 'problem', 'proposedSolution', 'description'] as const
      const changedText = textFields.filter(
        (field) => data[field] !== undefined && data[field] !== solution[field],
      )
      for (const field of changedText) {
        solution[field] = data[field] as string
      }
      if (changedText.length > 0) {
        appendHistory(draft, {
          solutionId: id,
          action: 'UPDATED',
          description: `Solution details updated (${changedText.join(', ')})`,
          performedBy: ctx.actorId,
        })
      }

      if (data.approverIds) {
        const existing = new Set(
          draft.approvals.filter((a) => a.solutionId === id).map((a) => a.approverId),
        )
        const next = new Set(data.approverIds)

        for (const approverId of next) {
          if (existing.has(approverId)) continue
          const now = new Date().toISOString()
          for (const stage of ALL_STAGES) {
            draft.approvals.push({
              id: createId('apr'),
              solutionId: id,
              approverId,
              stage,
              status: 'PENDING',
              comment: null,
              createdAt: now,
              approvedAt: null,
            })
          }
          appendHistory(draft, {
            solutionId: id,
            action: 'APPROVER_ADDED',
            description: `Approver added: ${userName(approverId)}`,
            performedBy: ctx.actorId,
          })
        }

        // Removing an approver only drops rows that have not been decided yet.
        // A recorded decision is part of the audit trail and stays.
        draft.approvals = draft.approvals.filter(
          (a) => a.solutionId !== id || next.has(a.approverId) || a.status !== 'PENDING',
        )
      }

      touch(solution)
      return assemble(draft, solution)
    })
  },

  async updateSolutionStatus(
    id: string,
    status: SolutionStatus,
    ctx: ActorContext,
  ): Promise<SolutionWithMeta> {
    return db.transact((draft) => {
      const solution = requireSolution(draft, id)
      const transition = assertTransition(solution.status, status)

      // Approvals have their own entry points so the decision is always recorded.
      if (transition.kind !== 'advance') {
        throw new SolutionServiceError(
          `${statusLabel(solution.status)} can only be left by approving or rejecting it.`,
        )
      }

      // Entering a gate requires a roster, and clears any earlier decisions.
      if (isApprovalGate(status)) {
        const roster = approvalsForStage(draft, id, status)
        if (roster.length === 0) {
          throw new SolutionServiceError(
            'Add at least one approver before sending this solution for approval.',
          )
        }
        resetStage(draft, id, status)
        appendHistory(draft, {
          solutionId: id,
          action: 'APPROVAL_REQUESTED',
          fromStatus: solution.status,
          toStatus: status,
          description: `Sent for ${
            status === 'DISCUSSION_APPROVAL' ? 'discussion' : 'testing'
          } approval (${roster.length} approver${roster.length === 1 ? '' : 's'})`,
          performedBy: ctx.actorId,
        })
      }

      const from = solution.status
      solution.status = status
      if (status === 'COMPLETED') solution.completedAt = new Date().toISOString()
      touch(solution)

      appendHistory(draft, {
        solutionId: id,
        action: status === 'COMPLETED' ? 'COMPLETED' : 'STATUS_CHANGED',
        fromStatus: from,
        toStatus: status,
        description:
          status === 'COMPLETED' ? 'Solution marked as completed' : `Moved to ${statusLabel(status)}`,
        performedBy: ctx.actorId,
      })

      return assemble(draft, solution)
    })
  },

  /**
   * Adds one approver to one gate.
   *
   * Per-gate rather than per-solution: the roster set at creation applies to
   * both gates, but a gate can need someone the other does not — finance on the
   * testing sign-off, say. A gate the solution has already cleared is refused,
   * because a pending row there would be a decision nobody can act on.
   */
  async addApprover(id: string, input: AddApproverInput): Promise<SolutionWithMeta> {
    return db.transact((draft) => {
      const solution = requireSolution(draft, id)

      if (statusIndex(solution.status) > statusIndex(input.stage)) {
        throw new SolutionServiceError(
          `${statusLabel(input.stage)} has already been passed, so no approver can be added to it.`,
        )
      }

      const duplicate = draft.approvals.some(
        (approval) =>
          approval.solutionId === id &&
          approval.stage === input.stage &&
          approval.approverId === input.approverId,
      )
      if (duplicate) {
        throw new SolutionServiceError(
          `${userName(input.approverId)} is already an approver on ${statusLabel(input.stage)}.`,
        )
      }

      draft.approvals.push({
        id: createId('apr'),
        solutionId: id,
        approverId: input.approverId,
        stage: input.stage,
        status: 'PENDING',
        comment: null,
        createdAt: new Date().toISOString(),
        approvedAt: null,
      })

      appendHistory(draft, {
        solutionId: id,
        action: 'APPROVER_ADDED',
        description: `${userName(input.approverId)} added as approver on ${statusLabel(input.stage)}`,
        performedBy: input.actorId,
      })

      touch(solution)
      return assemble(draft, solution)
    })
  },

  async approveSolution(id: string, input: ApproveInput): Promise<SolutionWithMeta> {
    return db.transact((draft) => {
      const solution = requireSolution(draft, id)
      const stage = solution.status
      if (!isApprovalGate(stage)) {
        throw new SolutionServiceError('This solution is not currently awaiting approval.')
      }

      const approverId = input.approverId ?? input.actorId
      const approval = approvalsForStage(draft, id, stage).find((a) => a.approverId === approverId)
      if (!approval) {
        throw new SolutionServiceError(`${userName(approverId)} is not an approver for this stage.`)
      }
      if (approval.status === 'APPROVED') {
        throw new SolutionServiceError(`${userName(approverId)} has already approved this stage.`)
      }

      const comment = input.comment?.trim()
      approval.status = 'APPROVED'
      approval.comment = comment || null
      approval.approvedAt = new Date().toISOString()

      appendHistory(draft, {
        solutionId: id,
        action: 'APPROVED',
        fromStatus: stage,
        description: `Approved by ${userName(approverId)}${comment ? ` - ${comment}` : ''}`,
        performedBy: input.actorId,
      })

      // The gate opens only once every approver has signed off.
      const roster = approvalsForStage(draft, id, stage)
      if (roster.every((a) => a.status === 'APPROVED')) {
        const target = getApprovalTarget(stage)
        assertTransition(stage, target)
        solution.status = target
        appendHistory(draft, {
          solutionId: id,
          action: 'STATUS_CHANGED',
          fromStatus: stage,
          toStatus: target,
          description: `All approvals received, moved to ${statusLabel(target)}`,
          performedBy: input.actorId,
        })
      }

      touch(solution)
      return assemble(draft, solution)
    })
  },

  async rejectSolution(id: string, input: RejectInput): Promise<SolutionWithMeta> {
    const reason = input.reason?.trim()
    if (!reason) {
      throw new SolutionServiceError('A reason is required when rejecting a solution.')
    }

    return db.transact((draft) => {
      const solution = requireSolution(draft, id)
      const stage = solution.status
      if (!isApprovalGate(stage)) {
        throw new SolutionServiceError('This solution is not currently awaiting approval.')
      }

      const approverId = input.approverId ?? input.actorId
      const approval = approvalsForStage(draft, id, stage).find((a) => a.approverId === approverId)
      if (!approval) {
        throw new SolutionServiceError(`${userName(approverId)} is not an approver for this stage.`)
      }

      approval.status = 'REJECTED'
      approval.comment = reason
      approval.approvedAt = new Date().toISOString()

      const target = getRejectionTarget(stage)
      assertTransition(stage, target)

      appendHistory(draft, {
        solutionId: id,
        action: 'REJECTED',
        fromStatus: stage,
        toStatus: target,
        description: `Rejected by ${userName(approverId)}: ${reason}`,
        performedBy: input.actorId,
      })
      appendHistory(draft, {
        solutionId: id,
        action: 'STATUS_CHANGED',
        fromStatus: stage,
        toStatus: target,
        description: `Returned to ${statusLabel(target)} for rework`,
        performedBy: input.actorId,
      })

      solution.status = target
      touch(solution)
      return assemble(draft, solution)
    })
  },

  async getSolutionHistory(id: string): Promise<History[]> {
    const history = await db.list('history')
    return history
      .filter((h) => h.solutionId === id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  },

  async getSolutionApprovals(id: string): Promise<Approval[]> {
    const approvals = await db.list('approvals')
    return approvals.filter((a) => a.solutionId === id)
  },

  async getStats(): Promise<SolutionStats> {
    const draft = await db.read()
    const enriched = draft.solutions.map((solution) => assemble(draft, solution))

    return {
      total: enriched.length,
      byStatus: countByStatus(enriched),
      pendingApproval: enriched.filter((s) => s.pendingStage !== null).length,
      overdue: enriched.filter((s) => s.isOverdue).length,
      dueSoon: enriched.filter(isDueSoon).length,
      completed: enriched.filter((s) => s.status === 'COMPLETED').length,
    }
  },
}
