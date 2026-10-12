import { PriorityBadge } from '@/components/common/PriorityBadge';
import { formatDateTime, formatDueDate, isOverdue } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { Task } from '@/types/api';

function Item({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

export function TaskDetails({ task }: { task: Task }): React.JSX.Element {
  const overdue = isOverdue(task.dueDate, task.status);
  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Item label="Assignee">{task.assignee.name}</Item>
        <Item label="Created by">{task.createdBy.name}</Item>
        <Item label="Priority">
          <PriorityBadge priority={task.priority} />
        </Item>
        <Item label="Due date">
          <span className={cn(overdue && 'font-medium text-destructive')}>
            {formatDueDate(task.dueDate)}
            {overdue && ' (overdue)'}
          </span>
        </Item>
        <Item label="Created">{formatDateTime(task.createdAt)}</Item>
      </dl>
      <div>
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Description</h2>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm">{task.description}</p>
      </div>
    </div>
  );
}
