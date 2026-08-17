import { ArrowUpRight, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export interface StatCardProps {
  label: string
  value: number
  icon: LucideIcon
  /** Tailwind classes for the icon tile: background + icon colour. */
  accent?: string
  /** Unit shown against the number — "%" or " days" — at a smaller weight. */
  suffix?: string
  /** One short line under the label saying what the number counts. */
  note?: string
  /** Makes the whole card a link into a filtered list. */
  to?: string
  emphasis?: 'default' | 'warning' | 'danger'
  isLoading?: boolean
}

export function StatCard({
  label,
  value,
  icon: Icon,
  accent = 'bg-primary/10 text-primary',
  suffix,
  note,
  to,
  emphasis = 'default',
  isLoading,
}: StatCardProps) {
  // Emphasis only earns colour when there is something to look at: a zero
  // overdue count should read as calm, not as a red alert.
  /* A count is never "NaN" to a reader — it is zero or it is a bug elsewhere.
     Rendering 0 keeps a broken upstream sum from becoming visible nonsense. */
  const count = Number.isFinite(value) ? value : 0
  const active = count > 0
  const isWarning = emphasis === 'warning' && active
  const isDanger = emphasis === 'danger' && active

  const content = (
    <Card
      className={cn(
        // Padding is trimmed so the longest label ("Pending Approval") stays on
        // one line at the tightest breakpoint, where eight tiles share a row.
        'group relative h-full overflow-hidden p-3.5 transition-all duration-200',
        to && 'hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-pop',
        isWarning && 'border-amber-200 bg-amber-50/30',
        isDanger && 'border-red-200 bg-red-50/30',
      )}
    >
      {/* Icon and value share a row. */}
      <div className="flex items-center gap-3">
        <span
          className={cn(
            // `ring-current/10` would not compile: currentColor takes no alpha.
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-slate-900/[0.06] transition-transform duration-200',
            to && 'group-hover:scale-105',
            accent,
          )}
        >
          <Icon className="h-[18px] w-[18px]" strokeWidth={2.25} />
        </span>

        {isLoading ? (
          <Skeleton className="h-7 w-10" />
        ) : (
          // Proportional figures: tabular-nums makes a large value look loose.
          <p className="text-[28px] font-semibold leading-none tracking-tight text-foreground">
            {count}
            {/* A unit at full size competes with the figure it qualifies. */}
            {suffix && (
              <span className="ml-0.5 text-base font-medium text-muted-foreground">{suffix}</span>
            )}
          </p>
        )}
      </div>

      {/* The label gets the full card width, so it never has to truncate. */}
      <p className="mt-3 whitespace-nowrap text-sm font-semibold leading-snug text-muted-foreground">
        {label}
      </p>
      {/* The line that stops a bare number being ambiguous — "on time" out of
          what, "median" of which span. Wraps freely; it is prose, not a label. */}
      {note && <p className="mt-0.5 text-xs leading-snug text-muted-foreground/80">{note}</p>}

      {to && (
        <ArrowUpRight
          className="absolute right-3 top-3 h-4 w-4 text-muted-foreground/0 transition-colors duration-200 group-hover:text-muted-foreground/60"
          aria-hidden
        />
      )}
    </Card>
  )

  if (!to) return content

  return (
    <Link
      to={to}
      className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {content}
    </Link>
  )
}
