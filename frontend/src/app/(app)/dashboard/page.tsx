'use client';

import { ErrorState } from '@/components/common/ErrorState';
import { PageHeader } from '@/components/common/PageHeader';
import { AttentionList } from '@/components/dashboard/AttentionList';
import { StatusCard } from '@/components/dashboard/StatusCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { STATUS_ORDER } from '@/lib/constants';
import { useGetDashboardQuery } from '@/services/api/dashboardApi';
import { useListTasksQuery } from '@/services/api/tasksApi';

export default function DashboardPage(): React.JSX.Element {
  const { user, isAdmin } = useAuth();
  const dashboard = useGetDashboardQuery();
  // Admins act on submitted work; employees act on tasks they have not started yet.
  const attentionStatus = isAdmin ? 'PENDING_APPROVAL' : 'PENDING';
  const attention = useListTasksQuery({ status: attentionStatus, page: 1, limit: 5 });

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={isAdmin ? 'Overview of every task in the system.' : `Your assigned tasks, ${user?.name.split(' ')[0] ?? ''}.`}
      />

      {dashboard.isError ? (
        <ErrorState message={dashboard.error.message} onRetry={() => void dashboard.refetch()} />
      ) : (
        <section aria-label="Tasks by status" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {STATUS_ORDER.map((status) =>
            dashboard.data ? <StatusCard key={status} status={status} count={dashboard.data.counts[status]} /> : <Skeleton key={status} className="h-[118px] rounded-xl" />,
          )}
        </section>
      )}

      <div className="mt-8">
        {attention.isError ? (
          <ErrorState message={attention.error.message} onRetry={() => void attention.refetch()} />
        ) : attention.data ? (
          <AttentionList
            title={isAdmin ? 'Awaiting your approval' : 'Waiting for you to start'}
            description={isAdmin ? 'Tasks employees have submitted for review.' : 'Assigned to you and not started yet.'}
            tasks={attention.data.items}
            viewAllHref={`/tasks?status=${attentionStatus}`}
            showAssignee={isAdmin}
          />
        ) : (
          <Skeleton className="h-56 rounded-xl" />
        )}
      </div>
    </div>
  );
}
