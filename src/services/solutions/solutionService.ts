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
  RemoveApproverInput,
  ReplaceApproverInput,
  RejectInput,
  ReviveInput,
  SolutionService,
  VoidInput,
} from '@/services/contracts'
import { db } from '@/services/db'
import { APPROVAL_STAGES } from '@/types/solution'
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
  isVoid,
  statusIndex,
  statusLabel,
} from '@/utils/workflow'

const ALL_STAGES: ApprovalStage[] = [...APPROVAL_STAGES]

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
/**
 * Give a gate with nobody on it the solution's roster, so it can be reached.
 *
 * A gate is empty only when it did not exist while the solution was being set up
 * — a gate added to the workflow later. Rather than make somebody remove and
 * re-add an approver to repair that, entering the gate fills it from the people
 * already signing off elsewhere.
 *
 * Only *empty* gates are filled. A gate with its own roster is left exactly as it
 * is, which is what keeps a deliberate single-gate addition from being fanned out
 * across the workflow by this function. Passed gates are never touched: their
 * decisions are history, and a new pending row behind the workflow would be a
 * decision nobody could ever record.
 */
function fillEmptyGates(draft: DatabaseSnapshot, solutionId: string): void {
  const solution = requireSolution(draft, solutionId)
  const rows = draft.approvals.filter((approval) => approval.solutionId === solutionId)
  /*
    Only people still owing a decision somewhere count as the roster. Taking
    anyone who ever had a row would resurrect an approver who was deliberately
    removed — their past decisions are kept as history, and history must not put
    them back on a gate they are no longer on.
  */
  const roster = Array.from(
    new Set(
      rows.filter((approval) => approval.status === 'PENDING').map((approval) => approval.approverId),
    ),
  )
  if (roster.length === 0) return

  const empty = ALL_STAGES.filter(
    (stage) =>
      statusIndex(solution.status) <= statusIndex(stage) &&
      !rows.some((approval) => approval.stage === stage),
  )
  const now = new Date().toISOString()

  for (const stage of empty) {
    for (const approverId of roster) {
      draft.approvals.push({
        id: createId('apr'),
        solutionId,
        approverId,
        stage,
        status: 'PENDING',
        comment: null,
        createdAt: now,
        approvedAt: null,
      })
    }
  }
}

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
    return sortSolutions(filtered, filters.sortBy, filters.sortDir, MOCK_USERS)
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
        fillEmptyGates(draft, id)
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
          description: `Sent for ${statusLabel(status).toLowerCase()} (${roster.length} approver${
            roster.length === 1 ? '' : 's'
          })`,
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

      if (isVoid(solution.status)) {
        throw new SolutionServiceError(
          `${solution.solutionNumber} is void. Revoke it before changing its approvers.`,
        )
      }

      /*
        Without a stage this is a roster addition, so it lands on every gate still
        ahead — the roster is the solution's, not the gate's. With one, it lands
        there and nowhere else.

        Passed gates are skipped rather than refused either way: their decisions
        are history, and being unable to add somebody to the remaining gates
        because an earlier one is closed would make the roster unmanageable halfway
        through a workflow.
      */
      const ahead = (stage: ApprovalStage) => statusIndex(solution.status) <= statusIndex(stage)

      if (input.stage && !ahead(input.stage)) {
        throw new SolutionServiceError(
          `${statusLabel(input.stage)} has already been passed, so no approver can be added to it.`,
        )
      }

      const open = (input.stage ? [input.stage] : ALL_STAGES).filter(ahead)
      if (open.length === 0) {
        throw new SolutionServiceError(
          `Every gate on ${solution.solutionNumber} has been passed, so its roster is closed.`,
        )
      }

      const missing = open.filter(
        (stage) =>
          !draft.approvals.some(
            (approval) =>
              approval.solutionId === id &&
              approval.stage === stage &&
              approval.approverId === input.approverId,
          ),
      )
      if (missing.length === 0) {
        throw new SolutionServiceError(
          input.stage
            ? `${userName(input.approverId)} is already an approver on ${statusLabel(input.stage)}.`
            : `${userName(input.approverId)} is already an approver on every remaining gate.`,
        )
      }

      const now = new Date().toISOString()
      for (const stage of missing) {
        draft.approvals.push({
          id: createId('apr'),
          solutionId: id,
          approverId: input.approverId,
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
        description: input.stage
          ? `${userName(input.approverId)} added as approver on ${statusLabel(input.stage)} only`
          : `${userName(input.approverId)} added as approver`,
        performedBy: input.actorId,
      })

      touch(solution)
      return assemble(draft, solution)
    })
  },

  async removeApprover(id: string, input: RemoveApproverInput): Promise<SolutionWithMeta> {
    return db.transact((draft) => {
      const solution = requireSolution(draft, id)

      if (isVoid(solution.status)) {
        throw new SolutionServiceError(
          `${solution.solutionNumber} is void. Revoke it before changing its approvers.`,
        )
      }

      const rows = draft.approvals.filter(
        (approval) => approval.solutionId === id && approval.approverId === input.approverId,
      )
      if (rows.length === 0) {
        throw new SolutionServiceError(
          `${userName(input.approverId)} is not on the roster for ${solution.solutionNumber}.`,
        )
      }

      const undecided = rows.filter((approval) => approval.status === 'PENDING')
      if (undecided.length === 0) {
        throw new SolutionServiceError(
          `${userName(
            input.approverId,
          )} has already recorded every decision, so there is nothing to remove.`,
        )
      }

      // Decisions survive removal: a recorded approval or rejection is the audit
      // trail, and deleting it would rewrite what happened.
      const dropped = new Set(undecided.map((approval) => approval.id))
      draft.approvals = draft.approvals.filter((approval) => !dropped.has(approval.id))

      appendHistory(draft, {
        solutionId: id,
        action: 'APPROVER_REMOVED',
        description: `${userName(input.approverId)} removed from the approver roster`,
        performedBy: input.actorId,
      })

      touch(solution)
      return assemble(draft, solution)
    })
  },

  async replaceApprover(id: string, input: ReplaceApproverInput): Promise<SolutionWithMeta> {
    return db.transact((draft) => {
      const solution = requireSolution(draft, id)

      if (isVoid(solution.status)) {
        throw new SolutionServiceError(
          `${solution.solutionNumber} is void. Revoke it before changing its approvers.`,
        )
      }

      if (input.fromApproverId === input.toApproverId) {
        throw new SolutionServiceError(`${userName(input.toApproverId)} is already the approver.`)
      }

      const outstanding = draft.approvals.filter(
        (approval) =>
          approval.solutionId === id &&
          approval.approverId === input.fromApproverId &&
          approval.status === 'PENDING',
      )
      if (outstanding.length === 0) {
        throw new SolutionServiceError(
          `${userName(input.fromApproverId)} has no decisions left to hand over.`,
        )
      }

      /*
        The replacement takes over precisely the gates the original still owed —
        no more. Decisions the original already recorded stay under their name:
        somebody else's signature cannot be reassigned.
      */
      const now = new Date().toISOString()
      for (const approval of outstanding) {
        const alreadyThere = draft.approvals.some(
          (other) =>
            other.solutionId === id &&
            other.stage === approval.stage &&
            other.approverId === input.toApproverId,
        )
        if (alreadyThere) continue
        draft.approvals.push({
          id: createId('apr'),
          solutionId: id,
          approverId: input.toApproverId,
          stage: approval.stage,
          status: 'PENDING',
          comment: null,
          createdAt: now,
          approvedAt: null,
        })
      }

      const dropped = new Set(outstanding.map((approval) => approval.id))
      draft.approvals = draft.approvals.filter((approval) => !dropped.has(approval.id))

      appendHistory(draft, {
        solutionId: id,
        action: 'APPROVER_REPLACED',
        description: `${userName(input.toApproverId)} replaces ${userName(
          input.fromApproverId,
        )} as approver`,
        performedBy: input.actorId,
      })

      touch(solution)
      return assemble(draft, solution)
    })
  },

  /**
   * Call the work off. Not a failure state and not terminal — the approval rows
   * and history are left exactly as they are so a revival resumes rather than
   * restarts.
   */
  async voidSolution(id: string, input: VoidInput): Promise<SolutionWithMeta> {
    // Enforced here, not only in the dialog: a host calling the service directly
    // must not be able to strand a solution with no explanation on record.
    const reason = input.reason?.trim()
    if (!reason) {
      throw new SolutionServiceError('A reason is required to mark a solution not feasible.')
    }

    return db.transact((draft) => {
      const solution = requireSolution(draft, id)
      const from = solution.status

      // `assertTransition` is what refuses this on a COMPLETED solution: voiding
      // delivered work would rewrite the record rather than cancel anything.
      assertTransition(from, 'VOID')

      solution.status = 'VOID'
      appendHistory(draft, {
        solutionId: id,
        action: 'VOIDED',
        fromStatus: from,
        toStatus: 'VOID',
        description: `Marked not feasible at ${statusLabel(from)}: ${reason}`,
        performedBy: input.actorId,
      })

      touch(solution)
      return assemble(draft, solution)
    })
  },

  /**
   * Revoke the void and put the solution back to work.
   *
   * A new due date is required rather than optional: the old one is in the past
   * or was part of why the work stalled, and reviving onto a stale deadline would
   * land straight in the overdue list.
   */
  async reviveSolution(id: string, input: ReviveInput): Promise<SolutionWithMeta> {
    return db.transact((draft) => {
      const solution = requireSolution(draft, id)

      if (!isVoid(solution.status)) {
        throw new SolutionServiceError(
          `${solution.solutionNumber} is not void, so there is nothing to revoke.`,
        )
      }

      assertTransition('VOID', input.status)

      const previousDue = solution.dueDate
      solution.status = input.status
      solution.dueDate = input.dueDate

      appendHistory(draft, {
        solutionId: id,
        action: 'REVIVED',
        fromStatus: 'VOID',
        toStatus: input.status,
        description:
          `Void revoked — back to ${statusLabel(input.status)}, ` +
          `due ${formatDate(input.dueDate)} (was ${formatDate(previousDue)})`,
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
        /* Completion is now something an approval does, not a button: the last
           gate ends the workflow, so the timestamp and the history action both
           belong here. */
        const completing = target === 'COMPLETED'
        if (completing) solution.completedAt = new Date().toISOString()
        appendHistory(draft, {
          solutionId: id,
          action: completing ? 'COMPLETED' : 'STATUS_CHANGED',
          fromStatus: stage,
          toStatus: target,
          description: completing
            ? 'Final approval received, solution completed'
            : `All approvals received, moved to ${statusLabel(target)}`,
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

  async getStats(filters: SolutionFilters = {}): Promise<SolutionStats> {
    const draft = await db.read()
    /*
      Filtered before counting, so a viewer who can only see their own work is not
      told there are eleven solutions in Development. A count is a disclosure too.
    */
    const enriched = filterSolutions(
      draft.solutions.map((solution) => assemble(draft, solution)),
      filters,
      MOCK_USERS,
    )

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
