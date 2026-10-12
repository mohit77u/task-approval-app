import Link from 'next/link';
import { PriorityBadge } from '@/components/common/PriorityBadge';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDueDate, isOverdue } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { Task } from '@/types/api';

interface AttentionListProps {
  title: string;
  description: string;
  tasks: Task[];
  viewAllHref: string;
  showAssignee: boolean;
}

export function AttentionList({ title, description, tasks, viewAllHref, showAssignee }: AttentionListProps): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardAction>
          <Link href={viewAllHref} className="text-sm font-medium text-primary hover:underline">
            View all
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nothing needs your attention right now.</p>
        ) : (
          <ul className="divide-y">
            {tasks.map((task) => (
              <li key={task.id}>
                <Link href={`/tasks/${task.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-muted/50">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{task.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {showAssignee && `${task.assignee.name} · `}
                      <span className={cn(isOverdue(task.dueDate, task.status) && 'font-medium text-destructive')}>Due {formatDueDate(task.dueDate)}</span>
                    </span>
                  </span>
                  <PriorityBadge priority={task.priority} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
