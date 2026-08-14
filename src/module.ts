/**
 * Public surface of the Solutions module.
 *
 * This is the file the CRM imports. Everything reachable from here is
 * intended to be stable; anything not exported here is an implementation
 * detail and may move.
 *
 *   import {
 *     SolutionsModuleProvider,
 *     SolutionsRoutes,
 *     type SolutionsServices,
 *   } from '@/modules/solutions'
 */

/* Entry points ------------------------------------------------------ */
export {
  SolutionsModuleProvider,
  type SolutionsModuleProviderProps,
} from '@/providers/SolutionsModuleProvider'
export { createToastAdapter } from '@/providers/toastAdapter'
export {
  SolutionsRoutes,
  solutionsRouteObjects,
  SOLUTIONS_ROUTE_PATHS,
} from '@/routes/solutionsRoutes'

/* Pages — mount these directly if the CRM owns the routing -----------*/
export { CompletedSolutionsPage } from '@/pages/CompletedSolutionsPage'
export { DashboardPage as SolutionsDashboardPage } from '@/pages/DashboardPage'
export { MySolutionsPage } from '@/pages/MySolutionsPage'
export { SolutionDetailsPage } from '@/pages/SolutionDetailsPage'
export { SolutionsPage } from '@/pages/SolutionsPage'

/* Composable components ---------------------------------------------*/
export { ActivityTimeline } from '@/components/solutions/ActivityTimeline'
export { ApprovalPanel } from '@/components/solutions/ApprovalPanel'
export { AttachmentList } from '@/components/solutions/AttachmentList'
export { SolutionCard } from '@/components/solutions/SolutionCard'
export { SolutionChat } from '@/components/solutions/SolutionChat'
export { SolutionDetails } from '@/components/solutions/SolutionDetails'
export { SolutionFilters } from '@/components/solutions/SolutionFilters'
export { SolutionPanel } from '@/components/solutions/SolutionPanel'
export {
  CreateSolutionDialog,
  EditSolutionDialog,
} from '@/components/solutions/SolutionFormDialog'
export { SolutionTable } from '@/components/solutions/SolutionTable'
export { WorkflowActions, WorkflowNotice } from '@/components/solutions/WorkflowActions'
export { WorkflowTracker } from '@/components/solutions/WorkflowTracker'

/* Data access -------------------------------------------------------*/
export {
  createStaticAuthService,
  localServices,
  notifications,
  SolutionServiceError,
} from '@/services'
export type {
  ActorContext,
  ApproveInput,
  AttachmentService,
  AuthService,
  ChatService,
  RejectInput,
  SolutionService,
  SolutionsServices,
  UserDirectory,
} from '@/services/contracts'

/* Hooks -------------------------------------------------------------*/
export { useSolutionChat } from '@/hooks/solutions/useSolutionChat'
export {
  useApproveSolution,
  useCreateSolution,
  useRejectSolution,
  useTransitionSolution,
  useUpdateSolution,
} from '@/hooks/solutions/useSolutionMutations'
export {
  useSolution,
  useSolutionHistory,
  useSolutions,
  useSolutionStats,
} from '@/hooks/solutions/useSolutions'
export { usePaths, usePermissions, useCurrentUser, useServices } from '@/hooks/useSolutionsModule'

/* Domain ------------------------------------------------------------*/
export * from '@/types'
export {
  assertTransition,
  canTransition,
  getAvailableTransitions,
  getNextTransition,
  isApprovalGate,
  statusLabel,
  statusProgress,
  STATUS_META,
  WorkflowTransitionError,
} from '@/utils/workflow'
export { hasPermission, permissionsForRole, ROLE_PERMISSIONS, toCurrentUser } from '@/utils/permissions'
export { PRIORITY_META, APPROVAL_STATUS_META } from '@/utils/solution'
export { solutionFormSchema, rejectionSchema } from '@/utils/validation'
