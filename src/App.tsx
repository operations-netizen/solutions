import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { AuthGate } from '@/components/auth/AuthGate'
import { MOCK_USERS } from '@/data/mockUsers'
import { AppShell } from '@/components/layout/AppShell'
import { Toaster } from '@/components/ui/toaster'
import { CompletedSolutionsPage } from '@/pages/CompletedSolutionsPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { MySolutionsPage } from '@/pages/MySolutionsPage'
import { SolutionDetailsPage } from '@/pages/SolutionDetailsPage'
import { SolutionsPage } from '@/pages/SolutionsPage'
import { SolutionsModuleProvider } from '@/providers/SolutionsModuleProvider'
import { createToastAdapter } from '@/providers/toastAdapter'
import { ROLE_LABELS } from '@/utils/permissions'

/**
 * Standalone application shell.
 *
 * This file is the part that does *not* travel to the CRM: the router, the
 * chrome, and the toast adapter. Everything below `pages/` and `components/`
 * moves across untouched, mounted under the CRM's own Solutions tab via
 * `SolutionsModuleProvider` + `SolutionsRoutes`.
 */
const notificationAdapter = createToastAdapter()

/**
 * One-click logins for the seeded accounts, built from the same `directory.json`
 * the server seeds the `users` collection from — so adding a person there gives
 * them a chip here without a second edit.
 *
 * Demo scaffolding: delete these two constants the moment real accounts exist,
 * and change `SEED_PASSWORD` on the server at the same time.
 */
const DEMO_ACCOUNTS = MOCK_USERS.map((user, _index, all) => ({
  // Two approvers would otherwise give two identical chips, so a shared role
  // carries the first name.
  label:
    all.filter((other) => other.role === user.role).length > 1
      ? ROLE_LABELS[user.role] + ' (' + user.name.split(' ')[0] + ')'
      : ROLE_LABELS[user.role],
  name: user.name,
  email: user.email,
}))

/** Must match `SEED_PASSWORD` in the server's environment. */
const DEMO_PASSWORD = 'hobu-demo-2026'

export default function App() {
  return (
    <BrowserRouter
      // Opt in to the v7 behaviours now; every internal link is absolute
      // (built from `usePaths`), so relative-splat resolution is a no-op here.
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      {/*
        Authentication wraps the provider rather than living inside it: the module
        must never mount — no queries, no permission checks — without a principal.
      */}
      <AuthGate
        fallback={<BootScreen />}
        demoAccounts={DEMO_ACCOUNTS}
        demoPassword={DEMO_PASSWORD}
      >
        {(user) => (
          <SolutionsModuleProvider
            currentUser={user}
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
        )}
      </AuthGate>
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
