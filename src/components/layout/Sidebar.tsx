import {
  CheckCircle2,
  LayoutDashboard,
  ListChecks,
  LogOut,
  UserRound,
  Workflow,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { UserAvatar } from '@/components/common/UserAvatar'
import { Button } from '@/components/ui/button'
import { useCurrentUser, usePaths } from '@/hooks/useSolutionsModule'
import { cn } from '@/lib/utils'
import { signOutAndReload, supportsSignIn } from '@/services'
import { ROLE_LABELS } from '@/utils/permissions'

interface SidebarNavProps {
  /** Called after a link is followed, so the mobile sheet can close itself. */
  onNavigate?: () => void
}

/**
 * Brand, primary navigation, and the signed-in user.
 *
 * Shared by both presentations: the fixed rail on large screens and the slide-in
 * sheet below `lg`. Neither one duplicates the markup.
 */
export function SidebarNav({ onNavigate }: SidebarNavProps) {
  const paths = usePaths()
  const currentUser = useCurrentUser()

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
        Who you are, and the way out. Only rendered when this build has a login at
        all — on `localStorage` there is no session to end, so a sign-out control
        would be a button that does nothing.
      */}
      {supportsSignIn && (
        <div className="flex shrink-0 items-center gap-2.5 border-t border-border px-3 py-2.5">
          <UserAvatar user={currentUser} size="sm" />
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-sm font-medium text-foreground">
              {currentUser.name}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {ROLE_LABELS[currentUser.role]}
            </span>
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => void signOutAndReload()}
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
            <span className="sr-only">Sign out</span>
          </Button>
        </div>
      )}

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
