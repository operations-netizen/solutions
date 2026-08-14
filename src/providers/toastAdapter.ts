import { toast } from 'sonner'

import type { NotificationAdapter, NotificationPayload } from '@/types/notification'

/**
 * Default adapter for the standalone build: render domain events as toasts.
 * The CRM swaps this for an adapter that posts to its own notification centre.
 */
export function createToastAdapter(
  onNavigate?: (payload: NotificationPayload) => void,
): NotificationAdapter {
  return {
    notify(payload) {
      const action =
        onNavigate && payload.solutionId
          ? { label: 'View', onClick: () => onNavigate(payload) }
          : undefined

      const options = { description: payload.description, action }

      switch (payload.level) {
        case 'success':
          toast.success(payload.title, options)
          break
        case 'error':
          toast.error(payload.title, options)
          break
        case 'warning':
          toast.warning(payload.title, options)
          break
        default:
          toast.info(payload.title, options)
      }
    },
  }
}
