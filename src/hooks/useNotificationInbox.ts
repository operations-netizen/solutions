/**
 * In-app notification inbox.
 *
 * This is not a new mechanism — it is a second `NotificationAdapter` alongside
 * the toast one. The dispatcher already fans out to every registered adapter, so
 * the bell sees exactly what the toasts see and no emitting code changes.
 *
 * The store lives at module scope rather than in component state: a toast fires
 * from a mutation that may outlive the component that triggered it, and the badge
 * must survive navigating between pages.
 */

import { useSyncExternalStore } from 'react'

import { notifications } from '@/services/notifications/notificationService'
import type { NotificationPayload } from '@/types/notification'
import { createId } from '@/utils/id'

export interface InboxItem {
  id: string
  payload: NotificationPayload
  read: boolean
}

/** Deep enough to be useful, shallow enough that nothing needs paging. */
const MAX_ITEMS = 30

let items: InboxItem[] = []
const listeners = new Set<() => void>()

function publish(next: InboxItem[]): void {
  items = next
  for (const listener of listeners) listener()
}

notifications.register({
  notify(payload) {
    publish([{ id: createId('ntf'), payload, read: false }, ...items].slice(0, MAX_ITEMS))
  },
})

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Must be reference-stable between changes or `useSyncExternalStore` loops. */
function getSnapshot(): InboxItem[] {
  return items
}

export function markAllRead(): void {
  if (!items.some((item) => !item.read)) return
  publish(items.map((item) => (item.read ? item : { ...item, read: true })))
}

export function clearNotifications(): void {
  if (items.length === 0) return
  publish([])
}

export function useNotificationInbox() {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  return {
    items: current,
    unread: current.reduce((count, item) => (item.read ? count : count + 1), 0),
    markAllRead,
    clear: clearNotifications,
  }
}
