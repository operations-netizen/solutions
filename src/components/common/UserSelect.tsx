import { Check, ChevronDown, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { UserAvatar } from '@/components/common/UserAvatar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useUsers } from '@/hooks/useDirectory'
import { cn } from '@/lib/utils'
import type { User } from '@/types/user'

interface UserSelectProps {
  value: string
  onChange: (userId: string) => void
  disabled?: boolean
  invalid?: boolean
  placeholder?: string
  /** Exclude users (e.g. the current assignee) from the list. */
  excludeIds?: string[]
}

/**
 * Single-select person picker with type-ahead.
 *
 * A plain `<Select>` only jumps to first-letter matches, which stops being
 * usable the moment the directory outgrows one screen. This filters as you
 * type across name, job title, and team, so "qa" or "engineering" finds people
 * just as well as "neha" does.
 */
export function UserSelect({
  value,
  onChange,
  disabled,
  invalid,
  placeholder = 'Select a person',
  excludeIds = [],
}: UserSelectProps) {
  const { data: users = [] } = useUsers()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const available = useMemo(
    () => users.filter((user) => !excludeIds.includes(user.id)),
    [users, excludeIds],
  )
  const selected = users.find((user) => user.id === value)

  const matches = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length === 0) return available
    // Every term must appear somewhere, so "neha qa" narrows rather than widens.
    return available.filter((user) => {
      const haystack = `${user.name} ${user.title} ${user.team}`.toLowerCase()
      return terms.every((term) => haystack.includes(term))
    })
  }, [available, query])

  /** A fresh query means the old highlight is meaningless. */
  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  /** Keep the highlighted row visible when arrowing past the fold. */
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, matches])

  function commit(user: User) {
    onChange(user.id)
    setOpen(false)
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    // Reopening should start from the full list, not the last search.
    if (!next) setQuery('')
  }

  /**
   * Typing stays in the input while the arrows drive the list, so the whole
   * control is operable without ever reaching for the mouse.
   */
  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (matches.length === 0) return
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((current) => (current + step + matches.length) % matches.length)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault() // Never submit the form from the search box.
      const user = matches[activeIndex]
      if (user) commit(user)
    }
  }

  return (
    /*
      `modal` is load-bearing, not decoration. This picker lives inside a Dialog,
      whose scroll lock only whitelists wheel events fired inside the dialog
      element — and the popover is portalled to <body>, outside it. Without its
      own lock the list simply refuses to scroll.
    */
    <Popover modal open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          className={cn(
            'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
            'disabled:cursor-not-allowed disabled:opacity-50',
            invalid && 'border-destructive',
          )}
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              <UserAvatar user={selected} size="xs" />
              <span className="truncate">{selected.name}</span>
              <span className="truncate text-muted-foreground">· {selected.title}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>

      {/* Matches the trigger width so the popover reads as part of the field. */}
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="relative border-b border-border">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search by name, title, or team"
            aria-label="Search people"
            className="h-10 border-0 pl-9 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>

        <div
          ref={listRef}
          className="max-h-64 overflow-y-auto overscroll-contain p-1.5"
          role="listbox"
        >
          {matches.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              No one matches “{query.trim()}”.
            </p>
          ) : (
            matches.map((user, index) => {
              const isSelected = user.id === value
              const isActive = index === activeIndex
              return (
                <button
                  key={user.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  data-active={isActive}
                  onClick={() => commit(user)}
                  onMouseMove={() => setActiveIndex(index)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors',
                    isActive && 'bg-accent',
                  )}
                >
                  <UserAvatar user={user} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{user.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {user.title} · {user.team}
                    </span>
                  </span>
                  {isSelected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
