import { Outlet, useLocation } from 'react-router-dom'

import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { MobileHeader } from './MobileHeader'
import { Sidebar } from './Sidebar'

/**
 * Standalone chrome: a fixed navigation rail on the left with the routed content
 * beside it, collapsing to a menu button and slide-in sheet below `lg`.
 *
 * Only the standalone build renders this. Inside the CRM the module's pages are
 * rendered into the CRM's own layout, which is why nothing under `pages/`
 * depends on this component.
 */
export function AppShell() {
  const location = useLocation()

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <MobileHeader />

      {/* Offset matches the rail's `w-60`; the two have to change together. */}
      <div className="lg:pl-60">
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
          {/* Keyed on the path so navigating away clears a failed screen. */}
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
