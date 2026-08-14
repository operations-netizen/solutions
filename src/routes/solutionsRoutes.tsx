/**
 * Routing, exported in both shapes a host might want.
 *
 * - `solutionsRouteObjects` plugs into an existing `createBrowserRouter` /
 *   `useRoutes` config as children of whatever path the CRM chooses.
 * - `<SolutionsRoutes />` is a drop-in element for a `<Route path="solutions/*">`
 *   inside a CRM that already renders its own `<Routes>` tree.
 *
 * Both render the same pages, so a host picks whichever fits its router setup.
 */

import type { RouteObject } from 'react-router-dom'
import { Navigate, Route, Routes } from 'react-router-dom'

import { CompletedSolutionsPage } from '@/pages/CompletedSolutionsPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { MySolutionsPage } from '@/pages/MySolutionsPage'
import { SolutionDetailsPage } from '@/pages/SolutionDetailsPage'
import { SolutionsPage } from '@/pages/SolutionsPage'

/** Paths relative to the module's mount point. */
export const SOLUTIONS_ROUTE_PATHS = {
  dashboard: '',
  mySolutions: 'my-solutions',
  solutions: 'solutions',
  solutionDetail: 'solutions/:solutionId',
  completed: 'completed',
} as const

export const solutionsRouteObjects: RouteObject[] = [
  { index: true, element: <DashboardPage /> },
  { path: SOLUTIONS_ROUTE_PATHS.mySolutions, element: <MySolutionsPage /> },
  { path: SOLUTIONS_ROUTE_PATHS.solutions, element: <SolutionsPage /> },
  { path: SOLUTIONS_ROUTE_PATHS.solutionDetail, element: <SolutionDetailsPage /> },
  { path: SOLUTIONS_ROUTE_PATHS.completed, element: <CompletedSolutionsPage /> },
]

export function SolutionsRoutes() {
  return (
    <Routes>
      <Route index element={<DashboardPage />} />
      <Route path={SOLUTIONS_ROUTE_PATHS.mySolutions} element={<MySolutionsPage />} />
      <Route path={SOLUTIONS_ROUTE_PATHS.solutions} element={<SolutionsPage />} />
      <Route path={SOLUTIONS_ROUTE_PATHS.solutionDetail} element={<SolutionDetailsPage />} />
      <Route path={SOLUTIONS_ROUTE_PATHS.completed} element={<CompletedSolutionsPage />} />
      <Route path="*" element={<Navigate to="" replace />} />
    </Routes>
  )
}
