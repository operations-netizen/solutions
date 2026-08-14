/**
 * Service contracts — the integration seam.
 *
 * The UI is written against these interfaces, never against the local
 * implementations. To run this module inside the CRM you implement these
 * interfaces over the CRM's API and pass them to `SolutionsModuleProvider`.
 * No component, hook, or page changes.
 */

import type {
  Approval,
  ApprovalStage,
  Attachment,
  Comment,
  CreateSolutionInput,
  History,
  NewAttachmentInput,
  SolutionDetail,
  SolutionFilters,
  SolutionStats,
  SolutionStatus,
  SolutionWithMeta,
  UpdateSolutionInput,
} from '@/types/solution'
import type { CurrentUser, Team, User } from '@/types/user'

/** Every write records who performed it. A real API would infer this from the session. */
export interface ActorContext {
  actorId: string
}

export interface ApproveInput extends ActorContext {
  comment?: string
  /**
   * Whose sign-off this is. Defaults to `actorId`. A user holding
   * `solution:approve` (the HOBU) can record a decision on an approver's
   * behalf — the actor is still captured separately in the history entry.
   */
  approverId?: string
}

export interface AddApproverInput extends ActorContext {
  approverId: string
  /** Which gate they sign off at. Each gate carries its own roster. */
  stage: ApprovalStage
}

export interface RejectInput extends ActorContext {
  /** Mandatory — the workflow refuses a rejection without one. */
  reason: string
  approverId?: string
}

export interface SolutionService {
  getSolutions(filters?: SolutionFilters): Promise<SolutionWithMeta[]>
  getSolution(id: string): Promise<SolutionDetail>
  createSolution(input: CreateSolutionInput, ctx: ActorContext): Promise<SolutionWithMeta>
  updateSolution(id: string, data: UpdateSolutionInput, ctx: ActorContext): Promise<SolutionWithMeta>
  /** Validated against the workflow state machine; throws on an illegal move. */
  updateSolutionStatus(id: string, status: SolutionStatus, ctx: ActorContext): Promise<SolutionWithMeta>
  /** Adds one approver to a single gate; refused for a gate already cleared. */
  addApprover(id: string, input: AddApproverInput): Promise<SolutionWithMeta>
  approveSolution(id: string, input: ApproveInput): Promise<SolutionWithMeta>
  rejectSolution(id: string, input: RejectInput): Promise<SolutionWithMeta>
  getSolutionHistory(id: string): Promise<History[]>
  getSolutionApprovals(id: string): Promise<Approval[]>
  getStats(): Promise<SolutionStats>
}

/** Solution-scoped discussion. Kept separate so it can move to a socket later. */
export interface ChatService {
  getSolutionComments(solutionId: string): Promise<Comment[]>
  addSolutionComment(solutionId: string, message: string, ctx: ActorContext): Promise<Comment>
  /**
   * Optional live transport. The local implementation returns a no-op
   * unsubscribe; a Socket.IO implementation would push new messages here.
   */
  subscribe?(solutionId: string, onMessage: (comment: Comment) => void): () => void
}

export interface AttachmentService {
  getAttachments(solutionId: string): Promise<Attachment[]>
  upload(solutionId: string, file: NewAttachmentInput, ctx: ActorContext): Promise<Attachment>
  remove(solutionId: string, attachmentId: string, ctx: ActorContext): Promise<void>
}

export interface UserDirectory {
  getUsers(): Promise<User[]>
  getTeams(): Promise<Team[]>
}

export interface AuthService {
  getCurrentUser(): Promise<CurrentUser>
}

/**
 * Everything the module needs from its host. Supply a partial override to
 * `SolutionsModuleProvider` and the rest falls back to the local
 * implementations.
 */
export interface SolutionsServices {
  solutions: SolutionService
  chat: ChatService
  attachments: AttachmentService
  users: UserDirectory
  auth: AuthService
}
