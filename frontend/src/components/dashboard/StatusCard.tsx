import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { STATUS_LABEL, STATUS_STYLES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { TaskStatus } from '@/types/api';

/** One status count. The whole card links to the task list filtered to that status. */
export function StatusCard({ status, count }: { status: TaskStatus; count: number }): React.JSX.Element {
  return (
    <Link href={`/tasks?status=${status}`} aria-label={`${STATUS_LABEL[status]}: ${count} tasks`} className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card className="transition-shadow hover:shadow-md">
        <CardContent className="space-y-3 p-1">
          <span className={cn('inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium', STATUS_STYLES[status])}>{STATUS_LABEL[status]}</span>
          <p className="text-4xl font-semibold tabular-nums">{count}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
