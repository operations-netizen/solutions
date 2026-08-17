/**
 * Write operations.
 *
 * Two things happen here that deliberately do not happen in the service layer:
 * cache invalidation, and emitting domain notifications. Services stay pure and
 * transport-agnostic; this file is the React-facing glue.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useCurrentUser, useServices } from '@/hooks/useSolutionsModule'
import { notifications } from '@/services/notifications/notificationService'
import type {
  ApprovalStage,
  CreateSolutionInput,
  NewAttachmentInput,
  SolutionStatus,
  SolutionWithMeta,
  UpdateSolutionInput,
} from '@/types/solution'
import { statusLabel, type ReviveTarget } from '@/utils/workflow'
import { solutionKeys } from './queryKeys'

/** Anything the user could plausibly have caused gets a readable message. */
export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Something went wrong. Please try again.'
}

function useInvalidateSolutions() {
  const queryClient = useQueryClient()

  return (solutionId?: string) => {
    void queryClient.invalidateQueries({ queryKey: solutionKeys.lists() })
    void queryClient.invalidateQueries({ queryKey: solutionKeys.stats() })
    if (solutionId) {
      void queryClient.invalidateQueries({ queryKey: solutionKeys.detail(solutionId) })
    }
  }
}

export function useCreateSolution() {
  const { solutions } = useServices()
  const currentUser = useCurrentUser()
  const invalidate = useInvalidateSolutions()

  return useMutation({
    mutationFn: (input: CreateSolutionInput) =>
      solutions.createSolution(input, { actorId: currentUser.id }),
    onSuccess: (solution) => {
      invalidate(solution.id)
      notifications.emit('SOLUTION_CREATED', {
        title: `${solution.solutionNumber} created`,
        description: `${solution.title} is now in Discussion.`,
        solutionId: solution.id,
        solutionNumber: solution.solutionNumber,
      })
      notifications.emit('SOLUTION_ASSIGNED', {
        title: 'Solution assigned',
        description: `${solution.solutionNumber} was assigned for delivery.`,
        solutionId: solution.id,
        solutionNumber: solution.solutionNumber,
        recipientIds: [solution.assignedUserId],
      })
    },
  })
}

export function useUpdateSolution(solutionId: string) {
  const { solutions } = useServices()
  const currentUser = useCurrentUser()
  const invalidate = useInvalidateSolutions()

  return useMutation({
    mutationFn: (data: UpdateSolutionInput) =>
      solutions.updateSolution(solutionId, data, { actorId: currentUser.id }),
    onSuccess: (solution) => {
      invalidate(solution.id)
      notifications.emit('STATUS_CHANGED', {
        title: `${solution.solutionNumber} updated`,
        description: 'Your changes have been saved.',
        solutionId: solution.id,
        solutionNumber: solution.solutionNumber,
      })
    },
  })
}

/** Advance along the workflow. Illegal moves are rejected by the state machine. */
export function useTransitionSolution(solutionId: string) {
  const { solutions } = useServices()
  const currentUser = useCurrentUser()
  const invalidate = useInvalidateSolutions()

  return useMutation({
    mutationFn: (status: SolutionStatus) =>
      solutions.updateSolutionStatus(solutionId, status, { actorId: currentUser.id }),
    onSuccess: (solution) => {
      invalidate(solution.id)
      emitStatusNotification(solution)
    },
  })
}

function emitStatusNotification(solution: SolutionWithMeta) {
  const shared = {
    solutionId: solution.id,
    solutionNumber: solution.solutionNumber,
  }

  if (solution.status === 'COMPLETED') {
    notifications.emit('SOLUTION_COMPLETED', {
      title: `${solution.solutionNumber} completed`,
      description: `${solution.title} has been closed out.`,
      ...shared,
    })
    return
  }

  if (solution.pendingStage) {
    notifications.emit('APPROVAL_REQUESTED', {
      title: 'Approval requested',
      description: `${solution.solutionNumber} is waiting on ${solution.approvals.filter((a) => a.stage === solution.pendingStage && a.status === 'PENDING').length} approver(s).`,
      recipientIds: solution.approvals
        .filter((a) => a.stage === solution.pendingStage && a.status === 'PENDING')
        .map((a) => a.approverId),
      ...shared,
    })
    return
  }

  notifications.emit('STATUS_CHANGED', {
    title: `Moved to ${statusLabel(solution.status)}`,
    description: `${solution.solutionNumber} - ${solution.title}`,
    ...shared,
  })
}

export function useVoidSolution(solutionId: string) {
  const { solutions } = useServices()
  const currentUser = useCurrentUser()
  const invalidate = useInvalidateSolutions()

  return useMutation({
    mutationFn: (input: { reason: string }) =>
      solutions.voidSolution(solutionId, { ...input, actorId: currentUser.id }),
    onSuccess: (solution) => {
      invalidate(solution.id)
      notifications.emit('STATUS_CHANGED', {
        title: `${solution.solutionNumber} marked not feasible`,
        description: 'It is out of the pipeline until the void is revoked.',
        solutionId: solution.id,
        solutionNumber: solution.solutionNumber,
      })
    },
  })
}

export function useReviveSolution(solutionId: string) {
  const { solutions } = useServices()
  const currentUser = useCurrentUser()
  const invalidate = useInvalidateSolutions()

  return useMutation({
    mutationFn: (input: { status: ReviveTarget; dueDate: string }) =>
      solutions.reviveSolution(solutionId, { ...input, actorId: currentUser.id }),
    onSuccess: (solution) => {
      invalidate(solution.id)
      notifications.emit('STATUS_CHANGED', {
        title: `${solution.solutionNumber} is back in ${statusLabel(solution.status)}`,
        description: `Due ${new Date(solution.dueDate).toLocaleDateString()}.`,
        solutionId: solution.id,
        solutionNumber: solution.solutionNumber,
      })
    },
  })
}

/**
 * Puts one person on the roster — every gate, since the roster is the solution's.
 * With a `stage`, they are added to that gate alone (the HOBU's override).
 */
export function useAddApprover(solutionId: string) {
  const { solutions } = useServices()
  const currentUser = useCurrentUser()
  const invalidate = useInvalidateSolutions()

  return useMutation({
    mutationFn: (input: { approverId: string; stage?: ApprovalStage }) =>
      solutions.addApprover(solutionId, { ...input, actorId: currentUser.id }),
    onSuccess: (solution, variables) => {
      invalidate(solution.id)
      notifications.emit('APPROVAL_REQUESTED', {
        title: 'Approver added',
        description: variables.stage
          ? `${solution.solutionNumber} now needs their decision on ${statusLabel(variables.stage)}.`
          : `${solution.solutionNumber} now needs their decision at every gate.`,
        solutionId: solution.id,
        solutionNumber: solution.solutionNumber,
      })
    },
  })
}

/** Hands one approver's outstanding gates to somebody else, in one step. */
export function useReplaceApprover(solutionId: string) {
  const { solutions } = useServices()
  const currentUser = useCurrentUser()
  const invalidate = useInvalidateSolutions()

  return useMutation({
    mutationFn: (input: { fromApproverId: string; toApproverId: string }) =>
      solutions.replaceApprover(solutionId, { ...input, actorId: currentUser.id }),
    onSuccess: (solution) => invalidate(solution.id),
  })
}

/** Takes one person off the roster. Decisions they already made are kept. */
export function useRemoveApprover(solutionId: string) {
  const { solutions } = useServices()
  const currentUser = useCurrentUser()
  const invalidate = useInvalidateSolutions()

  return useMutation({
    mutationFn: (input: { approverId: string }) =>
      solutions.removeApprover(solutionId, { ...input, actorId: currentUser.id }),
    onSuccess: (solution) => invalidate(solution.id),
  })
}

export function useApproveSolution(solutionId: string) {
  const { solutions } = useServices()
  const currentUser = useCurrentUser()
  const invalidate = useInvalidateSolutions()

  return useMutation({
    mutationFn: (input: { approverId?: string; comment?: string }) =>
      solutions.approveSolution(solutionId, { ...input, actorId: currentUser.id }),
    onSuccess: (solution) => {
      invalidate(solution.id)
      notifications.emit('SOLUTION_APPROVED', {
        title: 'Approval recorded',
        description:
          solution.pendingStage === null
            ? `All approvals received. ${solution.solutionNumber} moved to ${statusLabel(solution.status)}.`
            : `${solution.solutionNumber} still needs the remaining approvals.`,
        solutionId: solution.id,
        solutionNumber: solution.solutionNumber,
      })
    },
  })
}

export function useRejectSolution(solutionId: string) {
  const { solutions } = useServices()
  const currentUser = useCurrentUser()
  const invalidate = useInvalidateSolutions()

  return useMutation({
    mutationFn: (input: { reason: string; approverId?: string }) =>
      solutions.rejectSolution(solutionId, { ...input, actorId: currentUser.id }),
    onSuccess: (solution) => {
      invalidate(solution.id)
      notifications.emit('SOLUTION_REJECTED', {
        title: `${solution.solutionNumber} rejected`,
        description: `Returned to ${statusLabel(solution.status)} for rework.`,
        solutionId: solution.id,
        solutionNumber: solution.solutionNumber,
        recipientIds: [solution.assignedUserId],
      })
    },
  })
}

export function useUploadAttachment(solutionId: string) {
  const { attachments } = useServices()
  const currentUser = useCurrentUser()
  const invalidate = useInvalidateSolutions()

  return useMutation({
    mutationFn: (file: NewAttachmentInput) =>
      attachments.upload(solutionId, file, { actorId: currentUser.id }),
    onSuccess: (attachment) => {
      invalidate(solutionId)
      notifications.emit('STATUS_CHANGED', {
        title: 'Attachment uploaded',
        description: attachment.fileName,
        solutionId,
      })
    },
  })
}

export function useRemoveAttachment(solutionId: string) {
  const { attachments } = useServices()
  const currentUser = useCurrentUser()
  const invalidate = useInvalidateSolutions()

  return useMutation({
    mutationFn: (attachmentId: string) =>
      attachments.remove(solutionId, attachmentId, { actorId: currentUser.id }),
    onSuccess: () => invalidate(solutionId),
  })
}
