/**
 * Notification dispatch.
 *
 * Business code calls `notifications.emit(...)` with a domain event. What
 * happens next is the adapter's business. Standalone that is a toast; in the
 * CRM it can be the CRM's notification centre, an email job, or both.
 */

import type {
  NotificationAdapter,
  NotificationEvent,
  NotificationLevel,
  NotificationPayload,
} from '@/types/notification'

export interface EmitOptions {
  title: string
  description?: string
  level?: NotificationLevel
  solutionId?: string
  solutionNumber?: string
  recipientIds?: string[]
}

/** Sensible default severity per event, overridable per call. */
const DEFAULT_LEVEL: Record<NotificationEvent, NotificationLevel> = {
  SOLUTION_CREATED: 'success',
  SOLUTION_ASSIGNED: 'info',
  APPROVAL_REQUESTED: 'info',
  SOLUTION_APPROVED: 'success',
  SOLUTION_REJECTED: 'error',
  STATUS_CHANGED: 'info',
  NEW_CHAT_MESSAGE: 'info',
  DUE_DATE_APPROACHING: 'warning',
  SOLUTION_OVERDUE: 'warning',
  SOLUTION_COMPLETED: 'success',
}

class NotificationDispatcher {
  private adapters = new Set<NotificationAdapter>()

  /** Returns an unsubscribe function so hosts can detach cleanly. */
  register(adapter: NotificationAdapter): () => void {
    this.adapters.add(adapter)
    return () => this.adapters.delete(adapter)
  }

  emit(event: NotificationEvent, options: EmitOptions): NotificationPayload {
    const payload: NotificationPayload = {
      event,
      title: options.title,
      description: options.description,
      level: options.level ?? DEFAULT_LEVEL[event],
      solutionId: options.solutionId,
      solutionNumber: options.solutionNumber,
      recipientIds: options.recipientIds,
      createdAt: new Date().toISOString(),
    }

    for (const adapter of this.adapters) {
      // One misbehaving adapter must not break the emitting flow.
      try {
        adapter.notify(payload)
      } catch (error) {
        console.error('[notifications] adapter threw', error)
      }
    }

    return payload
  }
}

export const notifications = new NotificationDispatcher()
