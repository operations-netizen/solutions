/**
 * Seed dataset for the standalone build.
 *
 * Nothing here is imported by a component — the local database consumes it once
 * on first run and the service layer is the only thing that reads it
 * afterwards. Deleting this file and pointing the services at a real API is the
 * whole integration story for data.
 *
 * `SEEDS` is empty, so a fresh install starts with nothing and every solution
 * is created through the UI. Timestamps in the builder are relative to "now", so
 * any seed added later lands with live dates rather than fixed ones.
 */

import {
  APPROVAL_STAGES,
  PIPELINE_STATUSES,
  type Approval,
  type ApprovalStage,
  type Attachment,
  type Comment,
  type History,
  type Solution,
  type SolutionPriority,
  type SolutionStatus,
} from '@/types/solution'
import {
  getRejectionTarget,
  isApprovalGate,
  statusIndex,
  statusLabel,
} from '@/utils/workflow'

export interface DatabaseSnapshot {
  solutions: Solution[]
  approvals: Approval[]
  comments: Comment[]
  history: History[]
  attachments: Attachment[]
}

const HOBU_ID = 'u-hobu'
const DAY = 24 * 60 * 60 * 1000

interface SeedAttachment {
  fileName: string
  fileSize: number
  mimeType: string
}

interface SeedComment {
  userId: string
  message: string
  /** Ordering hint; converted into a timestamp near the end of the trail. */
  hoursAgo: number
}

interface SolutionSeed {
  title: string
  problem: string
  proposedSolution: string
  description: string
  priority: SolutionPriority
  status: SolutionStatus
  assignedUserId: string
  assignedTeam: string
  createdDaysAgo: number
  /** Negative for an overdue solution. */
  dueInDays: number
  approverIds: string[]
  /** When at a gate, mark the first approver as already signed off. */
  partiallyApproved?: boolean
  /** Replay a rejection that happened at this gate before it was re-approved. */
  rejectedOnceAt?: ApprovalStage
  rejectionReason?: string
  attachments?: SeedAttachment[]
  chat?: SeedComment[]
}

/* ------------------------------------------------------------------ */
/* Seeds                                                               */
/* ------------------------------------------------------------------ */

const SEEDS: SolutionSeed[] = [
  // Intentionally empty: the app starts with no solutions and the first one is
  // created through the UI. The builder below stays because it is what makes a
  // seed internally consistent — add a `SolutionSeed` object here and it gets a
  // full approval trail, history, and chat for free.
]

/* ------------------------------------------------------------------ */
/* Generation                                                          */
/* ------------------------------------------------------------------ */

const iso = (ms: number) => new Date(ms).toISOString()

/**
 * Relative dwell time per stage.
 *
 * Real portfolios are lumpy: development takes far longer than an approval
 * decision. Spacing transitions evenly would make every stage look identical
 * and render the cycle-time analysis meaningless, so the seed weights them.
 *
 * `COMPLETED` carries weight not as a dwell — it is terminal — but so that a
 * completed solution's `completedAt` lands before "now" rather than on it.
 */
const STAGE_WEIGHTS: Record<SolutionStatus, number> = {
  DISCUSSION: 1.6,
  DISCUSSION_APPROVAL: 0.7,
  DEVELOPMENT: 3.6,
  DEVELOPMENT_APPROVAL: 0.6,
  TESTING: 1.6,
  TESTING_APPROVAL: 0.5,
  EXECUTION: 1.1,
  EXECUTION_APPROVAL: 0.5,
  COMPLETED: 1.5,
  // Never on a seeded path: a solution is voided by hand, not grown into it.
  VOID: 0,
}

/**
 * Statuses the solution passed through to arrive at `status`, in order.
 * The happy path is exactly the declared status order.
 */
function pathTo(status: SolutionStatus): SolutionStatus[] {
  return PIPELINE_STATUSES.slice(0, statusIndex(status) + 1)
}

interface Builder {
  history: History[]
  approvals: Approval[]
  comments: Comment[]
  attachments: Attachment[]
}

function buildSolution(seed: SolutionSeed, index: number, out: Builder): Solution {
  const now = Date.now()
  const solutionId = `sol-${String(index + 1).padStart(3, '0')}`
  const solutionNumber = `SOL-${String(index + 1).padStart(3, '0')}`
  const createdAt = now - seed.createdDaysAgo * DAY
  const path = pathTo(seed.status)

  // Distribute the lifetime across the stages it has passed through in
  // proportion to their weights, so each stage gets a plausible duration and
  // the last one is still open.
  const elapsed = now - createdAt
  const weights = path.map((status) => STAGE_WEIGHTS[status])
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1

  /** How long the solution spent (or has spent) in `path[step]`. */
  const stageSpan = (step: number) => (elapsed * weights[step]) / totalWeight
  /** When the solution entered `path[step]`. */
  const transitionAt = (step: number) =>
    createdAt + (elapsed * weights.slice(0, step).reduce((sum, w) => sum + w, 0)) / totalWeight

  let historySeq = 0
  const pushHistory = (entry: Omit<History, 'id' | 'solutionId'>) => {
    historySeq += 1
    out.history.push({ id: `his-${solutionId}-${historySeq}`, solutionId, ...entry })
  }

  pushHistory({
    action: 'CREATED',
    fromStatus: null,
    toStatus: 'DISCUSSION',
    description: 'Solution created',
    performedBy: HOBU_ID,
    createdAt: iso(createdAt),
  })

  // Approver roster is captured up front: one pending record per approver per
  // gate. Reaching a gate makes those records actionable; it does not create them.
  seed.approverIds.forEach((approverId, approverIndex) => {
    pushHistory({
      action: 'APPROVER_ADDED',
      fromStatus: null,
      toStatus: null,
      description: `Approver added: ${approverId}`,
      performedBy: HOBU_ID,
      createdAt: iso(createdAt + (approverIndex + 1) * 60_000),
    })
    for (const stage of APPROVAL_STAGES) {
      out.approvals.push({
        id: `apr-${solutionId}-${stage}-${approverId}`,
        solutionId,
        approverId,
        stage,
        status: 'PENDING',
        comment: null,
        createdAt: iso(createdAt + (approverIndex + 1) * 60_000),
        approvedAt: null,
      })
    }
  })

  const approvalsFor = (stage: ApprovalStage) =>
    out.approvals.filter((a) => a.solutionId === solutionId && a.stage === stage)

  // Replay each transition along the path.
  for (let step = 1; step < path.length; step += 1) {
    const from = path[step - 1]
    const to = path[step]
    const at = transitionAt(step)

    if (isApprovalGate(to)) {
      pushHistory({
        action: 'APPROVAL_REQUESTED',
        fromStatus: from,
        toStatus: to,
        description: `Sent for ${statusLabel(to).toLowerCase()}`,
        performedBy: HOBU_ID,
        createdAt: iso(at),
      })

      // A rejection that happened at this gate before the eventual approval.
      if (seed.rejectedOnceAt === to) {
        const rejector = seed.approverIds[0]
        // Both events sit inside this gate's own span, so the replay never
        // runs past the next real transition.
        pushHistory({
          action: 'REJECTED',
          fromStatus: to,
          toStatus: getRejectionTarget(to),
          description: `Rejected by ${rejector}: ${seed.rejectionReason ?? 'Rework required.'}`,
          performedBy: rejector,
          createdAt: iso(at + stageSpan(step) * 0.3),
        })
        pushHistory({
          action: 'APPROVAL_REQUESTED',
          fromStatus: getRejectionTarget(to),
          toStatus: to,
          description: 'Resubmitted for approval after rework',
          performedBy: HOBU_ID,
          createdAt: iso(at + stageSpan(step) * 0.6),
        })
      }
    }

    if (isApprovalGate(from)) {
      // Leaving a gate forwards means every approver signed off.
      for (const approval of approvalsFor(from)) {
        approval.status = 'APPROVED'
        approval.approvedAt = iso(at - 30_000)
        approval.comment = 'Approved.'
        pushHistory({
          action: 'APPROVED',
          fromStatus: from,
          toStatus: null,
          description: `Approved by ${approval.approverId}`,
          performedBy: approval.approverId,
          createdAt: iso(at - 30_000),
        })
      }
    }

    pushHistory({
      action: to === 'COMPLETED' ? 'COMPLETED' : 'STATUS_CHANGED',
      fromStatus: from,
      toStatus: to,
      description: to === 'COMPLETED' ? 'Solution marked as completed' : `Moved to ${statusLabel(to)}`,
      performedBy: HOBU_ID,
      createdAt: iso(at),
    })
  }

  // A solution parked at a gate may already have one sign-off recorded.
  if (seed.partiallyApproved && isApprovalGate(seed.status)) {
    const [first] = approvalsFor(seed.status)
    if (first) {
      const at = now - 9 * 60 * 60 * 1000
      first.status = 'APPROVED'
      first.approvedAt = iso(at)
      first.comment = 'Approved — figures reconcile with the finance ledger.'
      pushHistory({
        action: 'APPROVED',
        fromStatus: seed.status,
        toStatus: null,
        description: `Approved by ${first.approverId}`,
        performedBy: first.approverId,
        createdAt: iso(at),
      })
    }
  }

  ;(seed.attachments ?? []).forEach((file, fileIndex) => {
    const at = createdAt + 3 * 60 * 60 * 1000 + fileIndex * 60_000
    out.attachments.push({
      id: `att-${solutionId}-${fileIndex + 1}`,
      solutionId,
      fileName: file.fileName,
      // Placeholder location — a real storage service returns the URL here.
      fileUrl: `local://attachments/${solutionId}/${file.fileName}`,
      fileSize: file.fileSize,
      mimeType: file.mimeType,
      uploadedBy: seed.assignedUserId,
      createdAt: iso(at),
    })
    pushHistory({
      action: 'ATTACHMENT_UPLOADED',
      fromStatus: null,
      toStatus: null,
      description: `Attachment uploaded: ${file.fileName}`,
      performedBy: seed.assignedUserId,
      createdAt: iso(at),
    })
  })

  ;(seed.chat ?? []).forEach((message, messageIndex) => {
    const at = Math.max(createdAt + 60_000, now - message.hoursAgo * 60 * 60 * 1000)
    out.comments.push({
      id: `cmt-${solutionId}-${messageIndex + 1}`,
      solutionId,
      userId: message.userId,
      message: message.message,
      createdAt: iso(at),
    })
  })

  const completedAt = seed.status === 'COMPLETED' ? iso(transitionAt(path.length - 1)) : null
  const lastHistoryAt = out.history
    .filter((h) => h.solutionId === solutionId)
    .reduce((latest, h) => (h.createdAt > latest ? h.createdAt : latest), iso(createdAt))
  const lastCommentAt = out.comments
    .filter((c) => c.solutionId === solutionId)
    .reduce((latest, c) => (c.createdAt > latest ? c.createdAt : latest), lastHistoryAt)

  return {
    id: solutionId,
    solutionNumber,
    title: seed.title,
    problem: seed.problem,
    proposedSolution: seed.proposedSolution,
    description: seed.description,
    priority: seed.priority,
    status: seed.status,
    assignedUserId: seed.assignedUserId,
    assignedTeam: seed.assignedTeam,
    dueDate: iso(now + seed.dueInDays * DAY),
    createdBy: HOBU_ID,
    createdAt: iso(createdAt),
    updatedAt: completedAt && completedAt > lastCommentAt ? completedAt : lastCommentAt,
    completedAt,
  }
}

/** Build a complete, internally consistent dataset. */
export function createSeedSnapshot(): DatabaseSnapshot {
  const out: Builder = { history: [], approvals: [], comments: [], attachments: [] }
  const solutions = SEEDS.map((seed, index) => buildSolution(seed, index, out))

  return {
    solutions,
    approvals: out.approvals,
    comments: out.comments,
    history: out.history,
    attachments: out.attachments,
  }
}
