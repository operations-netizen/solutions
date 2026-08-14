import { useParams } from 'react-router-dom'

import { SolutionDetails } from '@/components/solutions/SolutionDetails'

/**
 * Route wrapper. All the work lives in `SolutionDetails`, which the CRM can
 * render directly with a `solutionId` without adopting this module's routing.
 */
export function SolutionDetailsPage() {
  const { solutionId } = useParams<{ solutionId: string }>()

  return <SolutionDetails solutionId={solutionId ?? ''} />
}
