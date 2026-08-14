import { useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  LayoutDashboard,
  ListChecks,
  RotateCcw,
  UserRound,
  Workflow,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { usePaths } from '@/hooks/useSolutionsModule'
import { cn } from '@/lib/utils'
import { db } from '@/services'

interface SidebarNavProps {
  /** Called after a link is followed, so the mobile sheet can close itself. */
  onNavigate?: () => void
}

/**
 * Brand, primary navigation, and the reset action.
 *
 * Shared by both presentations: the fixed rail on large screens and the slide-in
 * sheet below `lg`. Neither one duplicates the markup.
 */
export function SidebarNav({ onNavigate }: SidebarNavProps) {
  const paths = usePaths()
  const queryClient = useQueryClient()

  /*
    Nothing here is called plain "Solutions": inside the host CRM this whole rail
    sits beneath its Solutions section, so that label would only repeat the
    parent. "Tracker" also describes the page honestly — it holds every status,
    not just the in-flight ones, which is what separates it from Completed. "My
    Solutions" keeps the noun because the qualifier is the whole point.
  */
  const navItems = [
    { to: paths.dashboard, label: 'Dashboard', icon: LayoutDashboard, end: true },
    // Second: after the overview, before the full register. A person's own queue
    // is the screen they open most.
    { to: paths.mySolutions, label: 'My Solutions', icon: UserRound, end: false },
    { to: paths.solutions, label: 'Tracker', icon: ListChecks, end: false },
    { to: paths.completed, label: 'Completed', icon: CheckCircle2, end: false },
  ]

  async function resetDemoData() {
    await db.reset()
    await queryClient.invalidateQueries()
    toast.success('Demo data reset', { description: 'The seed dataset has been restored.' })
  }

  /** Active item is a filled pill; the rest stay quiet until hovered. */
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      isActive
        ? 'bg-primary/10 text-primary'
        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
    )

  return (
    <div className="flex h-full flex-col">
      {/* h-16 so the brand lines up with the mobile header's own bar height. */}
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-border px-5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Workflow className="h-4 w-4" />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold text-foreground">
            HOBU Solutions
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">
            Solution management
          </span>
        </span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {navItems.map((item) => (
          <NavLink
            key={item.label}
            to={item.to}
            end={item.end}
            className={linkClass}
            onClick={onNavigate}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/*
        Reset lives at the foot of the rail rather than in a menu, and carries its
        label: it is the only way back to the seeded dataset.
      */}
      <div className="shrink-0 border-t border-border p-3">
        <Button
          variant="ghost"
          className="w-full justify-start gap-3 px-3 font-medium text-muted-foreground hover:text-foreground"
          onClick={() => void resetDemoData()}
        >
          <RotateCcw className="h-4 w-4 shrink-0" />
          Reset demo data
        </Button>
      </div>
    </div>
  )
}

/**
 * The fixed rail. Hidden below `lg`, where the mobile header's sheet takes over.
 *
 * Width is 240px — `AppShell` offsets the content by the same `lg:pl-60`, so the
 * two must change together.
 */
export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-border bg-card lg:block">
      <SidebarNav />
    </aside>
  )
}
