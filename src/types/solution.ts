/**
 * Core domain types for the Solutions module.
 *
 * These are intentionally framework-free and transport-free: no React, no HTTP,
 * no storage details. When this module is embedded into the CRM, only the
 * service layer (`src/services/solutions`) needs to change — these shapes are
 * the contract every other layer is written against.
 */

/* ------------------------------------------------------------------ */
/* Enumerations                                                        */
/* ------------------------------------------------------------------ */

/**
 * The workflow states a solution can occupy.
 *
 * Order matters: the array below is also the visual order of the workflow
 * tracker and the basis for progress calculations.
 */
export const SOLUTION_STATUSES = [
  'DISCUSSION',
  'DISCUSSION_APPROVAL',
  'DEVELOPMENT',
  'TESTING',
  'TESTING_APPROVAL',
  'EXECUTION',
  'COMPLETED',
] as const

export type SolutionStatus = (typeof SOLUTION_STATUSES)[number]

/** The two approval gates in the workflow. */
export const APPROVAL_STAGES = ['DISCUSSION_APPROVAL', 'TESTING_APPROVAL'] as const
export type ApprovalStage = (typeof APPROVAL_STAGES)[number]

export const SOLUTION_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const
export type SolutionPriority = (typeof SOLUTION_PRIORITIES)[number]

/** Decision recorded against a single approver for a single gate. */
export const APPROVAL_DECISIONS = ['PENDING', 'APPROVED', 'REJECTED'] as const
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number]

/**
 * Roll-up of a solution's approval situation, used for badges and filtering.
 * `NOT_REQUIRED` means the solution is not currently sitting at an approval gate.
 */
export const APPROVAL_STATUSES = ['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED'] as const
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number]

/** Every action worth surfacing on the activity timeline. */
export const HISTORY_ACTIONS = [
  'CREATED',
  'UPDATED',
  'ASSIGNED',
  'DUE_DATE_CHANGED',
  'PRIORITY_CHANGED',
  'APPROVER_ADDED',
  'APPROVAL_REQUESTED',
  'APPROVED',
  'REJECTED',
  'STATUS_CHANGED',
  'COMMENT_ADDED',
  'ATTACHMENT_UPLOADED',
  'COMPLETED',
] as const

export type HistoryAction = (typeof HISTORY_ACTIONS)[number]

/* ------------------------------------------------------------------ */
/* Entities                                                            */
/* ------------------------------------------------------------------ */

/**
 * All timestamps are ISO-8601 strings rather than `Date` objects so the
 * entities survive JSON transport and `localStorage` round-trips unchanged.
 */
export type IsoDateString = string

export interface Solution {
  id: string
  /** Human-facing identifier, e.g. `SOL-001`. Unique and immutable. */
  solutionNumber: string
  title: string
  problem: string
  proposedSolution: string
  description: string
  priority: SolutionPriority
  status: SolutionStatus
  /** The one person accountable. A solution is never assigned to a team. */
  assignedUserId: string
  /** Derived from the assignee's team, for display and search. Never entered. */
  assignedTeam: string
  dueDate: IsoDateString
  createdBy: string
  createdAt: IsoDateString
  updatedAt: IsoDateString
  completedAt: IsoDateString | null
}

export interface Approval {
  id: string
  solutionId: string
  approverId: string
  stage: ApprovalStage
  status: ApprovalDecision
  /** Required when `status` is `REJECTED`; optional otherwise. */
  comment: string | null
  createdAt: IsoDateString
  /** Set when the approver reaches a decision — approve *or* reject. */
  approvedAt: IsoDateString | null
}

export interface Comment {
  id: string
  solutionId: string
  userId: string
  message: string
  createdAt: IsoDateString
}

export interface History {
  id: string
  solutionId: string
  action: HistoryAction
  fromStatus: SolutionStatus | null
  toStatus: SolutionStatus | null
  description: string
  performedBy: string
  createdAt: IsoDateString
}

export interface Attachment {
  id: string
  solutionId: string
  fileName: string
  fileUrl: string
  /** Bytes. Kept alongside the URL so the list can render without a HEAD request. */
  fileSize: number
  mimeType: string
  uploadedBy: string
  createdAt: IsoDateString
}

/* ------------------------------------------------------------------ */
/* Aggregates & view models                                            */
/* ------------------------------------------------------------------ */

/**
 * A solution plus the computed fields the list/detail views need.
 * Derived server-side in a real backend; derived in the service layer here so
 * no component ever has to recompute it.
 */
export interface SolutionWithMeta extends Solution {
  approvalStatus: ApprovalStatus
  /** Approval gate the solution is currently waiting on, if any. */
  pendingStage: ApprovalStage | null
  isOverdue: boolean
  /** Negative when overdue. `null` once completed. */
  daysUntilDue: number | null
  /** 0–100, based on position in the workflow. */
  progress: number
  approvals: Approval[]
  attachmentCount: number
  commentCount: number
}

/** Full detail payload for the solution detail page. */
export interface SolutionDetail extends SolutionWithMeta {
  history: History[]
  comments: Comment[]
  attachments: Attachment[]
}

/* ------------------------------------------------------------------ */
/* Service inputs                                                      */
/* ------------------------------------------------------------------ */

export interface CreateSolutionInput {
  title: string
  problem: string
  proposedSolution: string
  description?: string
  priority: SolutionPriority
  assignedUserId: string
  dueDate: IsoDateString
  /** User ids of the people who must sign off at each approval gate. */
  approverIds: string[]
  attachments?: NewAttachmentInput[]
}

export interface NewAttachmentInput {
  fileName: string
  fileSize: number
  mimeType: string
  /**
   * `/api/files/<id>` when the app runs on MongoDB — a relative path so the row
   * survives the API changing host or port. An object URL, good only for the
   * current session, when it runs on `localStorage`.
   */
  fileUrl: string
}

export type UpdateSolutionInput = Partial<
  Pick<
    Solution,
    | 'title'
    | 'problem'
    | 'proposedSolution'
    | 'description'
    | 'priority'
    | 'assignedUserId'
    | 'dueDate'
  >
> & { approverIds?: string[] }

export interface SolutionFilters {
  /** Matches title, solution number, or assignee name. */
  search?: string
  status?: SolutionStatus | 'ALL'
  priority?: SolutionPriority | 'ALL'
  assignedUserId?: string | 'ALL'
  approvalStatus?: ApprovalStatus | 'ALL'
  /** Inclusive ISO date bounds on `dueDate`. */
  dueFrom?: IsoDateString
  dueTo?: IsoDateString
  /** Convenience buckets used by the status tabs. */
  bucket?: 'ALL' | 'PENDING_APPROVAL' | 'OVERDUE' | 'ACTIVE'
  sortBy?: SolutionSortKey
  sortDir?: 'asc' | 'desc'
}

export const SOLUTION_SORT_KEYS = [
  'updatedAt',
  'createdAt',
  'dueDate',
  'priority',
  'solutionNumber',
  'title',
] as const
export type SolutionSortKey = (typeof SOLUTION_SORT_KEYS)[number]

export interface SolutionStats {
  total: number
  byStatus: Record<SolutionStatus, number>
  pendingApproval: number
  overdue: number
  dueSoon: number
  completed: number
}
