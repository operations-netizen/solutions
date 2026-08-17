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
 * The linear pipeline, in order. This order *is* the workflow tracker and the
 * basis for progress, so nothing may be inserted without meaning it.
 */
export const PIPELINE_STATUSES = [
  'DISCUSSION',
  'DISCUSSION_APPROVAL',
  'DEVELOPMENT',
  'DEVELOPMENT_APPROVAL',
  'TESTING',
  'TESTING_APPROVAL',
  'EXECUTION',
  'EXECUTION_APPROVAL',
  'COMPLETED',
] as const

export type PipelineStatus = (typeof PIPELINE_STATUSES)[number]

/**
 * Every state a solution can occupy.
 *
 * `VOID` is deliberately outside the pipeline: it is not a later stage of the
 * work, it is the work being called off as not feasible. It therefore has no
 * position, no progress, and no column in the load charts — and it is reversible,
 * unlike `COMPLETED`.
 */
export const SOLUTION_STATUSES = [...PIPELINE_STATUSES, 'VOID'] as const

export type SolutionStatus = (typeof SOLUTION_STATUSES)[number]

/** The two approval gates in the workflow. */
export const APPROVAL_STAGES = [
  'DISCUSSION_APPROVAL',
  'DEVELOPMENT_APPROVAL',
  'TESTING_APPROVAL',
  'EXECUTION_APPROVAL',
] as const
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
  'APPROVER_REMOVED',
  'APPROVER_REPLACED',
  'APPROVAL_REQUESTED',
  'APPROVED',
  'REJECTED',
  'STATUS_CHANGED',
  'COMMENT_ADDED',
  'ATTACHMENT_UPLOADED',
  'COMPLETED',
  'VOIDED',
  'REVIVED',
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
  /** A single status, a list of them (used to select a whole phase), or `ALL`. */
  status?: SolutionStatus | SolutionStatus[] | 'ALL'
  priority?: SolutionPriority | 'ALL'
  assignedUserId?: string | 'ALL'
  approvalStatus?: ApprovalStatus | 'ALL'
  /** Inclusive ISO date bounds on `dueDate`. */
  dueFrom?: IsoDateString
  dueTo?: IsoDateString
  /**
   * Restrict to solutions this person is looped into — assignee, raiser, or on the
   * approver roster. Set by the read hooks for anybody without `solution:viewAll`,
   * so a list and its counts show the same work the detail page will open.
   */
  participantId?: string
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
  'assignee',
  'raiser',
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
