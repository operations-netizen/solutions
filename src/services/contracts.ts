/**
 * Service contracts — the integration seam.
 *
 * The UI is written against these interfaces, never against the local
 * implementations. To run this module inside the CRM you implement these
 * interfaces over the CRM's API and pass them to `SolutionsModuleProvider`.
 * No component, hook, or page changes.
 */

import type {
  ApprovalStage,
  Approval,
  IsoDateString,
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
import type { ReviveTarget } from '@/utils/workflow'

/** Every write records who performed it. A real API would infer this from the session. */
export interface ActorContext {
  actorId: string
}

export interface ApproveInput extends ActorContext {
  comment?: string
  /**
   * Whose sign-off this is. Defaults to `actorId`. Approvers record their own
   * decision; a user holding `solution:override` (the HOBU) can record one on an
   * approver's behalf — the actor is still captured separately in the history
   * entry, so a decision somebody else entered is never mistaken for your own.
   */
  approverId?: string
}

/**
 * One roster serves the whole workflow.
 *
 * There is no per-gate roster: the same people sign off at Discussion,
 * Development, Testing and Execution, and adding somebody puts them on every gate
 * that has not been passed yet. Only a user holding `solution:update` manages it.
 */
export interface AddApproverInput extends ActorContext {
  approverId: string
  /**
   * Restrict this addition to one gate.
   *
   * Omitted — the ordinary case — the person joins the roster and therefore every
   * gate still ahead. Named, they are added to that gate alone, which is the
   * override the HOBU has for the times one decision needs somebody the rest of
   * the workflow does not: finance on the money gate, nobody else's business.
   */
  stage?: ApprovalStage
}

export interface RemoveApproverInput extends ActorContext {
  approverId: string
}

/**
 * Hand one approver's outstanding decisions to somebody else.
 *
 * Remove-then-add in one step, and deliberately not two: the replacement inherits
 * exactly the gates the original still owed a decision on, which a pair of calls
 * would have to work out for itself — and would get wrong for an approver who was
 * only ever added to one gate.
 */
export interface ReplaceApproverInput extends ActorContext {
  fromApproverId: string
  toApproverId: string
}

export interface VoidInput extends ActorContext {
  /** Mandatory — the workflow refuses a void without one, as with a rejection. */
  reason: string
}

export interface ReviveInput extends ActorContext {
  /** Which working stage it comes back into. */
  status: ReviveTarget
  /** A fresh due date is mandatory: the old one is why it stalled. */
  dueDate: IsoDateString
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
  /** Calls the work off as not feasible. Reversible via `reviveSolution`. */
  voidSolution(id: string, input: VoidInput): Promise<SolutionWithMeta>
  /** Brings a voided solution back into a working stage with a new due date. */
  reviveSolution(id: string, input: ReviveInput): Promise<SolutionWithMeta>
  /** Adds one approver to a single gate; refused for a gate already cleared. */
  addApprover(id: string, input: AddApproverInput): Promise<SolutionWithMeta>
  /**
   * Take somebody off the roster. Decisions they have already recorded stay —
   * they are the audit trail — so only their undecided rows are dropped.
   */
  removeApprover(id: string, input: RemoveApproverInput): Promise<SolutionWithMeta>
  replaceApprover(id: string, input: ReplaceApproverInput): Promise<SolutionWithMeta>
  approveSolution(id: string, input: ApproveInput): Promise<SolutionWithMeta>
  rejectSolution(id: string, input: RejectInput): Promise<SolutionWithMeta>
  getSolutionHistory(id: string): Promise<History[]>
  getSolutionApprovals(id: string): Promise<Approval[]>
  /** Counters over the same filtered set the list would return. */
  getStats(filters?: SolutionFilters): Promise<SolutionStats>
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
  /** `null` means nobody is signed in, which is a normal state, not an error. */
  getCurrentUser(): Promise<CurrentUser | null>
  /**
   * Optional: only an implementation that owns credentials has these. A CRM
   * host whose session is established elsewhere implements neither.
   */
  signIn?(email: string, password: string): Promise<CurrentUser>
  signOut?(): Promise<void>
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
