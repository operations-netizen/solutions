import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import type { User } from '@/types/user'
import { initials } from '@/utils/format'

interface UserAvatarProps {
  user?: Pick<User, 'name' | 'avatarUrl'>
  /** Falls back to this when the user could not be resolved. */
  name?: string
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}

/**
 * `xs` exists so callers stop hand-tuning `h-5 w-5 text-[9px]`: 16px with 8px
 * initials is unreadable, so 20px/10px is the floor and it lives here.
 */
const SIZES = {
  xs: 'h-5 w-5 text-[10px]',
  sm: 'h-7 w-7 text-[11px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-11 w-11 text-sm',
} as const

/**
 * One tint per person instead of one tint for everyone — a column of assignees
 * is scannable at a glance rather than a row of identical indigo discs. Tints
 * are light-background pairs so the initials clear contrast at every size.
 *
 * Class strings are literal on purpose: Tailwind's content scan cannot see
 * colours assembled at runtime.
 */
const TINTS = [
  'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  'bg-sky-50 text-sky-700 ring-sky-600/20',
  'bg-teal-50 text-teal-700 ring-teal-600/20',
  'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  'bg-amber-50 text-amber-700 ring-amber-600/25',
  'bg-orange-50 text-orange-700 ring-orange-600/20',
  'bg-rose-50 text-rose-700 ring-rose-600/20',
  'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-600/20',
  'bg-violet-50 text-violet-700 ring-violet-600/20',
  'bg-slate-100 text-slate-600 ring-slate-500/20',
] as const

/** Stable across renders and reloads: same name always gets the same tint. */
function tintFor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % 1_000_003
  }
  return TINTS[hash % TINTS.length]
}

export function UserAvatar({ user, name, size = 'md', className }: UserAvatarProps) {
  const displayName = user?.name ?? name ?? 'Unknown user'

  return (
    <Avatar className={cn(SIZES[size], className)} title={displayName}>
      {user?.avatarUrl && <AvatarImage src={user.avatarUrl} alt={displayName} />}
      {/*
        `ring-inset` rather than a border: it keeps the disc at its declared box
        size, so avatars stay aligned with the text beside them, and it gives the
        tint an edge on white cards as well as on muted rows.
      */}
      <AvatarFallback
        className={cn(
          'font-semibold uppercase tracking-[0.02em] ring-1 ring-inset',
          tintFor(displayName),
        )}
      >
        {initials(displayName)}
      </AvatarFallback>
    </Avatar>
  )
}

interface UserCellProps {
  user?: User
  name?: string
  /** Secondary line; defaults to the user's job title. */
  subtitle?: string
  size?: 'xs' | 'sm' | 'md'
  className?: string
}

/** Avatar + name + subtitle. The standard way a person is rendered anywhere. */
export function UserCell({ user, name, subtitle, size = 'sm', className }: UserCellProps) {
  const displayName = user?.name ?? name ?? 'Unassigned'

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <UserAvatar user={user} name={displayName} size={size} />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
        {(subtitle ?? user?.title) && (
          <p className="truncate text-xs text-muted-foreground">{subtitle ?? user?.title}</p>
        )}
      </div>
    </div>
  )
}
