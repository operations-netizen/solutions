import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Code2,
  Clock,
  FlaskConical,
  MessagesSquare,
  Rocket,
  Plus,
  ShieldCheck,
} from 'lucide-react'
import { useState } from 'react'

import { buildStatusClasses, StatusDistribution } from '@/components/charts/StatusDistribution'
import { PriorityStageHeatmap } from '@/components/charts/PriorityStageHeatmap'
import { NotificationBell } from '@/components/common/NotificationBell'
import { PageHeader } from '@/components/common/PageHeader'
import { SolutionPanel } from '@/components/solutions/SolutionPanel'
import { CreateSolutionDialog } from '@/components/solutions/SolutionFormDialog'
import { StatCard } from '@/components/solutions/StatCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useSolutions, useSolutionStats } from '@/hooks/solutions/useSolutions'
import { usePaths, usePermissions } from '@/hooks/useSolutionsModule'
import { DUE_SOON_DAYS, foldToPhases } from '@/utils/solution'
import { computePriorityStageMatrix } from '@/utils/matrix'

/**
 * Operational overview for the HOBU: the shape of the portfolio, where it sits
 * in the workflow, then the lists that actually need action.
 */
export function DashboardPage() {
  const paths = usePaths()
  const { can } = usePermissions()
  const [createOpen, setCreateOpen] = useState(false)

  const { data: stats, isLoading: statsLoading } = useSolutionStats()
  /* Gates fold into the phase they are waiting inside; see `foldToPhases`. */
  const byPhase = stats ? foldToPhases(stats.byStatus) : undefined
  const { data: solutions = [], isLoading } = useSolutions({ sortBy: 'updatedAt', sortDir: 'desc' })

  const recent = solutions.slice(0, 5)
  const pendingApproval = solutions.filter((s) => s.pendingStage !== null).slice(0, 5)
  const overdue = solutions.filter((s) => s.isOverdue).slice(0, 5)
  const upcoming = solutions
    .filter(
      (s) =>
        s.status !== 'COMPLETED' &&
        s.daysUntilDue !== null &&
        s.daysUntilDue >= 0 &&
        s.daysUntilDue <= DUE_SOON_DAYS,
    )
    .sort((a, b) => (a.daysUntilDue ?? 0) - (b.daysUntilDue ?? 0))
    .slice(0, 5)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Solutions Dashboard"
        actions={
          <>
            <NotificationBell className="h-10 w-10" />
            {can('solution:create') && (
              <Button size="lg" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                Add Solution
              </Button>
            )}
          </>
        }
      />

      {/*
        Total, then the five phases in workflow order, then the two flags.
        A phase count includes its approval gate — a solution waiting on
        Discussion Approval counts under Discussion, because that is the work it
        is waiting inside. So the five phases sum to Total, while "Pending
        Approval" and "Overdue" deliberately overlap them: both answer "what
        needs attention", not "what stage is this in".
      */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <StatCard
          label="Total Solutions"
          value={stats?.total ?? 0}
          icon={ClipboardList}
          to={paths.solutions}
          isLoading={statsLoading}
        />
        <StatCard
          label="Discussion"
          value={byPhase?.DISCUSSION ?? 0}
          icon={MessagesSquare}
          accent="bg-sky-100 text-sky-600"
          to={`${paths.solutions}?tab=DISCUSSION`}
          isLoading={statsLoading}
        />
        <StatCard
          label="Development"
          value={byPhase?.DEVELOPMENT ?? 0}
          icon={Code2}
          accent="bg-blue-100 text-blue-600"
          to={`${paths.solutions}?tab=DEVELOPMENT`}
          isLoading={statsLoading}
        />
        <StatCard
          label="Testing"
          value={byPhase?.TESTING ?? 0}
          icon={FlaskConical}
          accent="bg-pink-100 text-pink-600"
          to={`${paths.solutions}?tab=TESTING`}
          isLoading={statsLoading}
        />
        <StatCard
          label="Execution"
          value={byPhase?.EXECUTION ?? 0}
          icon={Rocket}
          accent="bg-violet-100 text-violet-600"
          to={`${paths.solutions}?tab=EXECUTION`}
          isLoading={statsLoading}
        />
        <StatCard
          label="Completed"
          value={stats?.completed ?? 0}
          icon={CheckCircle2}
          accent="bg-emerald-100 text-emerald-600"
          to={paths.completed}
          isLoading={statsLoading}
        />
        <StatCard
          label="Pending Approval"
          value={stats?.pendingApproval ?? 0}
          icon={ShieldCheck}
          accent="bg-amber-100 text-amber-600"
          emphasis="warning"
          to={`${paths.solutions}?tab=PENDING_APPROVAL`}
          isLoading={statsLoading}
        />
        <StatCard
          label="Overdue"
          value={stats?.overdue ?? 0}
          icon={AlertTriangle}
          accent="bg-red-100 text-red-600"
          emphasis="danger"
          to={`${paths.solutions}?overdue=1`}
          isLoading={statsLoading}
        />
      </div>

      {/* Two views of the same portfolio: by stage, then stage against priority. */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="flex min-w-0 flex-col">
          <CardHeader className="pb-4">
            <CardTitle>Solutions Overview</CardTitle>
            <p className="text-sm text-muted-foreground">
              Where all {stats?.total ?? 0} solutions currently sit in the workflow.
            </p>
          </CardHeader>

          {/* Centred so the shorter card reads as balanced next to its
              neighbour rather than top-heavy with a gap beneath. */}
          <CardContent className="flex flex-1 flex-col justify-center pt-0">
            {statsLoading || !stats ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <StatusDistribution classes={buildStatusClasses(stats.byStatus)} />
            )}
          </CardContent>
        </Card>

        <Card className="flex min-w-0 flex-col">
          <CardHeader className="pb-4">
            <CardTitle>Priority vs Stage</CardTitle>
            <p className="text-sm text-muted-foreground">
              Where open work sits, by how urgent it is. Click a cell to filter.
            </p>
          </CardHeader>

          <CardContent className="flex flex-1 flex-col pt-0">
            {isLoading ? (
              <Skeleton className="h-full min-h-[240px] w-full" />
            ) : (
              <PriorityStageHeatmap matrix={computePriorityStageMatrix(solutions)} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Two panels per row. */}
      <div className="grid gap-5 lg:grid-cols-2">
        <SolutionPanel
          title="Recent Solutions"
          icon={Clock}
          viewAllTo={paths.solutions}
          isLoading={isLoading}
          solutions={recent}
          meta="updated"
          showAssignee
          emptyTitle="No solutions yet"
          emptyDescription="Create the first solution to get the workflow moving."
        />

        <SolutionPanel
          title="Pending Approvals"
          icon={ShieldCheck}
          viewAllTo={`${paths.solutions}?tab=PENDING_APPROVAL`}
          isLoading={isLoading}
          solutions={pendingApproval}
          meta="status"
          emptyTitle="Nothing awaiting approval"
          emptyDescription="No solution is currently sitting at an approval gate."
        />

        <SolutionPanel
          title="Upcoming Deadlines"
          icon={CalendarClock}
          viewAllTo={paths.solutions}
          isLoading={isLoading}
          solutions={upcoming}
          meta="due"
          emptyTitle="No deadlines this week"
          emptyDescription={`Nothing is due within ${DUE_SOON_DAYS} days.`}
        />

        <SolutionPanel
          title="Overdue"
          icon={AlertTriangle}
          viewAllTo={`${paths.solutions}?overdue=1`}
          isLoading={isLoading}
          solutions={overdue}
          meta="due"
          tone="danger"
          emptyTitle="Nothing overdue"
          emptyDescription="Every active solution is inside its due date."
        />
      </div>

      <CreateSolutionDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  )
}
