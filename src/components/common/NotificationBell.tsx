import { Bell, CheckCheck } from 'lucide-react'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useNotificationInbox } from '@/hooks/useNotificationInbox'
import { usePaths } from '@/hooks/useSolutionsModule'
import { cn } from '@/lib/utils'
import type { NotificationLevel } from '@/types/notification'
import { formatRelative } from '@/utils/format'

/** One dot colour per severity, matching the toast levels. */
const LEVEL_DOT: Record<NotificationLevel, string> = {
  info: 'bg-primary',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
}

interface NotificationBellProps {
  className?: string
}

/**
 * Everything the app has emitted this session, newest first.
 *
 * Toasts are the interruption and they disappear; this is the record of what
 * happened while you were looking elsewhere. Opening the panel marks the batch
 * read — the badge answers "is there anything new", and once you have looked,
 * there isn't.
 */
export function NotificationBell({ className }: NotificationBellProps) {
  const { items, unread, markAllRead, clear } = useNotificationInbox()
  const paths = usePaths()

  return (
    <DropdownMenu onOpenChange={(open) => open && markAllRead()}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={cn('relative shrink-0', className)}
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span
              className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-background"
              aria-hidden
            >
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <p className="text-sm font-semibold text-foreground">Notifications</p>
          {items.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={clear}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </div>

        <DropdownMenuSeparator className="my-0" />

        {items.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            Nothing yet. Approvals, assignments, and status changes land here.
          </p>
        ) : (
          // Capped height with its own scroll: the list holds up to 30 entries.
          <div className="max-h-80 overflow-y-auto overscroll-contain py-1">
            {items.map((item) => {
              const { payload } = item
              const body = (
                <>
                  <span
                    className={cn(
                      'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                      LEVEL_DOT[payload.level],
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-snug text-foreground">
                      {payload.title}
                    </span>
                    {payload.description && (
                      <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                        {payload.description}
                      </span>
                    )}
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      {formatRelative(payload.createdAt)}
                    </span>
                  </span>
                </>
              )

              const shell = 'flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors'

              /* Only a notification that names a solution can be followed. */
              return payload.solutionId ? (
                <Link
                  key={item.id}
                  to={paths.solution(payload.solutionId)}
                  className={cn(shell, 'hover:bg-accent')}
                >
                  {body}
                </Link>
              ) : (
                <div key={item.id} className={shell}>
                  {body}
                </div>
              )
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Marks the inbox read on mount. Exported for a host that renders its own
 * trigger and just wants the badge cleared when its panel opens.
 */
export function useMarkNotificationsRead(): void {
  const { markAllRead } = useNotificationInbox()
  useEffect(() => markAllRead(), [markAllRead])
}
