import { Check, ChevronDown, X } from 'lucide-react'

import { UserAvatar } from '@/components/common/UserAvatar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useUsers } from '@/hooks/useDirectory'
import { cn } from '@/lib/utils'

interface ApproverSelectProps {
  value: string[]
  onChange: (value: string[]) => void
  disabled?: boolean
  invalid?: boolean
  /** Exclude a user (typically the assignee) from the list. */
  excludeIds?: string[]
}

/**
 * Multi-select for the approver roster. Approvers sign off at both gates, so
 * this list is the roster for the whole workflow, not just the next step.
 */
export function ApproverSelect({
  value,
  onChange,
  disabled,
  invalid,
  excludeIds = [],
}: ApproverSelectProps) {
  const { data: users = [] } = useUsers()
  const available = users.filter((user) => !excludeIds.includes(user.id))
  const selected = users.filter((user) => value.includes(user.id))

  function toggle(userId: string) {
    onChange(value.includes(userId) ? value.filter((id) => id !== userId) : [...value, userId])
  }

  return (
    <div className="space-y-2">
      {/* `modal` for the same reason as UserSelect: a body-portalled popover is
          outside the Dialog's scroll lock, so its list cannot scroll without
          taking over the lock itself. */}
      <Popover modal>
        <PopoverTrigger asChild disabled={disabled}>
          <button
            type="button"
            aria-invalid={invalid}
            className={cn(
              'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
              'disabled:cursor-not-allowed disabled:opacity-50',
              invalid && 'border-destructive',
            )}
          >
            <span className={cn(selected.length === 0 && 'text-muted-foreground')}>
              {selected.length === 0
                ? 'Select approvers'
                : `${selected.length} approver${selected.length === 1 ? '' : 's'} selected`}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>

        <PopoverContent className="w-[min(22rem,calc(100vw-2rem))] p-1.5" align="start">
          <div className="max-h-72 overflow-y-auto overscroll-contain">
            {available.map((user) => {
              const checked = value.includes(user.id)
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => toggle(user.id)}
                  className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent"
                >
                  <Checkbox checked={checked} tabIndex={-1} className="pointer-events-none" />
                  <UserAvatar user={user} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{user.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {user.title} · {user.team}
                    </p>
                  </div>
                  {checked && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              )
            })}
          </div>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((user) => (
            <span
              key={user.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-secondary py-0.5 pl-1 pr-1.5 text-xs font-medium"
            >
              <UserAvatar user={user} size="xs" />
              {user.name}
              {!disabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="h-4 w-4 rounded-full hover:bg-background"
                  onClick={() => toggle(user.id)}
                >
                  <X className="h-3 w-3" />
                  <span className="sr-only">Remove {user.name}</span>
                </Button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
