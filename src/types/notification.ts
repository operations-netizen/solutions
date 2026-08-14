/**
 * Notification contract.
 *
 * The module *emits* domain events; it does not decide how they are shown.
 * Standalone, a toast adapter renders them. Inside the CRM, swap in an adapter
 * that forwards to the CRM's notification bus — no calling code changes.
 */

export const NOTIFICATION_EVENTS = [
  'SOLUTION_CREATED',
  'SOLUTION_ASSIGNED',
  'APPROVAL_REQUESTED',
  'SOLUTION_APPROVED',
  'SOLUTION_REJECTED',
  'STATUS_CHANGED',
  'NEW_CHAT_MESSAGE',
  'DUE_DATE_APPROACHING',
  'SOLUTION_OVERDUE',
  'SOLUTION_COMPLETED',
] as const

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number]

export type NotificationLevel = 'info' | 'success' | 'warning' | 'error'

export interface NotificationPayload {
  event: NotificationEvent
  title: string
  description?: string
  level: NotificationLevel
  /** Ids so an adapter can deep-link or fan out to the right recipients. */
  solutionId?: string
  solutionNumber?: string
  recipientIds?: string[]
  createdAt: string
}

/**
 * Implemented by whoever is hosting the module. `notify` must be
 * side-effect-only — the module never awaits it or reads a return value.
 */
export interface NotificationAdapter {
  notify(payload: NotificationPayload): void
}
