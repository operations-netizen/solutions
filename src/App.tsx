import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { AppShell } from '@/components/layout/AppShell'
import { Toaster } from '@/components/ui/toaster'
import { CompletedSolutionsPage } from '@/pages/CompletedSolutionsPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { MySolutionsPage } from '@/pages/MySolutionsPage'
import { SolutionDetailsPage } from '@/pages/SolutionDetailsPage'
import { SolutionsPage } from '@/pages/SolutionsPage'
import { SolutionsModuleProvider } from '@/providers/SolutionsModuleProvider'
import { createToastAdapter } from '@/providers/toastAdapter'

/**
 * Standalone application shell.
 *
 * This file is the part that does *not* travel to the CRM: the router, the
 * chrome, and the toast adapter. Everything below `pages/` and `components/`
 * moves across untouched, mounted under the CRM's own Solutions tab via
 * `SolutionsModuleProvider` + `SolutionsRoutes`.
 */
const notificationAdapter = createToastAdapter()

export default function App() {
  return (
    <BrowserRouter
      // Opt in to the v7 behaviours now; every internal link is absolute
      // (built from `usePaths`), so relative-splat resolution is a no-op here.
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <SolutionsModuleProvider
        notificationAdapter={notificationAdapter}
        fallback={<BootScreen />}
      >
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="my-solutions" element={<MySolutionsPage />} />
            <Route path="solutions" element={<SolutionsPage />} />
            <Route path="solutions/:solutionId" element={<SolutionDetailsPage />} />
            <Route path="completed" element={<CompletedSolutionsPage />} />
            <Route path="*" element={<DashboardPage />} />
          </Route>
        </Routes>
        <Toaster />
      </SolutionsModuleProvider>
    </BrowserRouter>
  )
}

function BootScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Loading HOBU Solutions...</p>
    </div>
  )
}
