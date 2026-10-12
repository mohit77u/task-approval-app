'use client';

import { ErrorState } from '@/components/common/ErrorState';
import { PageHeader } from '@/components/common/PageHeader';
import { AttentionList } from '@/components/dashboard/AttentionList';
import { StatusCard } from '@/components/dashboard/StatusCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { ATTENTION_LIMIT, attentionStatuses, mergeAttention } from '@/lib/attention';
import { STATUS_ORDER } from '@/lib/constants';
import { useGetDashboardQuery } from '@/services/api/dashboardApi';
import { useListTasksQuery } from '@/services/api/tasksApi';

export default function DashboardPage(): React.JSX.Element {
  const { user, isAdmin } = useAuth();
  const dashboard = useGetDashboardQuery();
  // Admins act on submitted work; employees on tasks not started yet plus ones sent back to them by a rejection.
  const [firstStatus, secondStatus] = attentionStatuses(isAdmin);
  // Skipped until the user (and so the role) is known, otherwise the employee default would fire for an admin.
  const first = useListTasksQuery({ status: firstStatus, page: 1, limit: ATTENTION_LIMIT }, { skip: !user });
  const second = useListTasksQuery({ status: secondStatus, page: 1, limit: ATTENTION_LIMIT }, { skip: !user || !secondStatus });
  const attentionError = first.isError ? first : second.isError ? second : undefined;
  const attentionTasks = mergeAttention([first.data?.items, second.data?.items]);
  const attentionReady = Boolean(first.data) && (!secondStatus || Boolean(second.data));

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
        {attentionError?.isError ? (
          <ErrorState message={attentionError.error.message} onRetry={() => void attentionError.refetch()} />
        ) : attentionReady ? (
          <AttentionList
            title={isAdmin ? 'Awaiting your approval' : 'Needs your action'}
            description={isAdmin ? 'Tasks employees have submitted for review.' : 'Assigned to you: not started yet, or sent back for changes.'}
            tasks={attentionTasks}
            viewAllHref={isAdmin ? '/tasks?status=PENDING_APPROVAL' : '/tasks'}
            showAssignee={isAdmin}
          />
        ) : (
          <Skeleton className="h-56 rounded-xl" />
        )}
      </div>
    </div>
  );
}
