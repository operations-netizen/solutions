/**
 * Validation schemas.
 *
 * Kept out of the components so the same rules can be reused by a future
 * server-side handler, and so a rule change happens in one place.
 */

import { z } from 'zod'

import { SOLUTION_PRIORITIES } from '@/types/solution'

/** Midnight today, for "not in the past" comparisons. */
function startOfToday(): Date {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

const requiredText = (field: string, min = 1, max = 5000) =>
  z
    .string()
    .trim()
    .min(min, min === 1 ? `${field} is required.` : `${field} must be at least ${min} characters.`)
    .max(max, `${field} must be ${max} characters or fewer.`)

export const solutionFormSchema = z.object({
  title: requiredText('Solution title', 1, 120),
  problem: requiredText('Problem / requirement', 1, 4000),
  proposedSolution: requiredText('Proposed solution', 1, 4000),
  description: z.string().trim().max(6000, 'Description must be 6000 characters or fewer.').optional(),

  // A person, not a team. The team is derived from this choice, never entered.
  assignedUserId: z.string().min(1, 'Select the person responsible for this solution.'),

  priority: z.enum(SOLUTION_PRIORITIES, {
    errorMap: () => ({ message: 'Select a priority.' }),
  }),

  dueDate: z
    .string()
    .min(1, 'A due date is required.')
    // A new solution is created today, so its due date cannot precede today.
    .refine((value) => {
      const due = new Date(`${value}T00:00:00`)
      return !Number.isNaN(due.getTime()) && due >= startOfToday()
    }, 'The due date cannot be earlier than the creation date.'),

  approverIds: z.array(z.string()).min(1, 'Select at least one approver.'),
})

export type SolutionFormValues = z.infer<typeof solutionFormSchema>

/**
 * Editing an existing solution reuses the same rules, except the due date is
 * checked against the original creation date rather than today.
 */
export function buildEditSolutionSchema(createdAt: string) {
  const created = new Date(createdAt)
  created.setHours(0, 0, 0, 0)

  return solutionFormSchema.extend({
    dueDate: z
      .string()
      .min(1, 'A due date is required.')
      .refine((value) => {
        const due = new Date(`${value}T00:00:00`)
        return !Number.isNaN(due.getTime()) && due >= created
      }, 'The due date cannot be earlier than the creation date.'),
  })
}

export const rejectionSchema = z.object({
  reason: requiredText('Rejection reason', 5, 1000),
})

export type RejectionFormValues = z.infer<typeof rejectionSchema>

export const approvalSchema = z.object({
  comment: z.string().trim().max(1000, 'Comment must be 1000 characters or fewer.').optional(),
})

export type ApprovalFormValues = z.infer<typeof approvalSchema>

export const chatMessageSchema = z.object({
  message: requiredText('Message', 1, 2000),
})
