'use client';

import { ErrorState } from '@/components/common/ErrorState';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime } from '@/lib/dates';
import { useGetTaskHistoryQuery } from '@/services/api/tasksApi';

export function HistoryTimeline({ taskId }: { taskId: number }): React.JSX.Element {
  const history = useGetTaskHistoryQuery(taskId);

  if (history.isError) return <ErrorState message={history.error.message} onRetry={() => void history.refetch()} />;
  if (!history.data) return <Skeleton className="h-24 w-full" />;

  return (
    <ol className="relative space-y-6 border-l pl-6" aria-label="Status history">
      {history.data.map((entry) => (
        <li key={entry.id} className="relative">
          <span className="absolute -left-[1.85rem] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" aria-hidden />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {entry.fromStatus ? (
              <>
                <span className="font-medium">{entry.actor.name}</span> moved
                <StatusBadge status={entry.fromStatus} />→<StatusBadge status={entry.toStatus} />
              </>
            ) : (
              <>
                <span className="font-medium">{entry.actor.name}</span> created the task as <StatusBadge status={entry.toStatus} />
              </>
            )}
          </div>
          {entry.note && <blockquote className="mt-2 border-l-2 pl-3 text-sm italic text-muted-foreground">{entry.note}</blockquote>}
          <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(entry.createdAt)}</p>
        </li>
      ))}
    </ol>
  );
}
