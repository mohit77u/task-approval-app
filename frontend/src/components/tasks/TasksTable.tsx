import Link from 'next/link';
import { PriorityBadge } from '@/components/common/PriorityBadge';
import { StatusBadge } from '@/components/common/StatusBadge';
import { TaskRowActions } from '@/components/tasks/TaskRowActions';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDueDate, isOverdue } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { Task } from '@/types/api';

interface TasksTableProps {
  tasks: Task[];
  isAdmin: boolean;
  /** True while a delete request is in flight; blocks starting a second one. */
  isDeleting?: boolean;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

function TasksTableView({ tasks, isAdmin, isDeleting, onEdit, onDelete }: Required<TasksTableProps>): React.JSX.Element {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Status</TableHead>
            {isAdmin && <TableHead>Assignee</TableHead>}
            <TableHead>Due</TableHead>
            {isAdmin && (
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task) => {
            const overdue = isOverdue(task.dueDate, task.status);
            return (
              <TableRow key={task.id}>
                <TableCell className="max-w-[18rem] font-medium">
                  <Link href={`/tasks/${task.id}`} className="block truncate hover:underline">
                    {task.title}
                  </Link>
                </TableCell>
                <TableCell>
                  <PriorityBadge priority={task.priority} />
                </TableCell>
                <TableCell>
                  <StatusBadge status={task.status} />
                </TableCell>
                {isAdmin && <TableCell className="whitespace-nowrap">{task.assignee.name}</TableCell>}
                <TableCell className={cn('whitespace-nowrap', overdue && 'font-medium text-destructive')}>
                  {formatDueDate(task.dueDate)}
                  {overdue && <span className="ml-1 text-xs">(overdue)</span>}
                </TableCell>
                {isAdmin && (
                  <TableCell>
                    <TaskRowActions task={task} isDeleting={isDeleting} onEdit={onEdit} onDelete={onDelete} />
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/** Stacked cards for narrow screens, where a five-column table would scroll sideways. */
function TasksCardList({ tasks, isAdmin, isDeleting, onEdit, onDelete }: Required<TasksTableProps>): React.JSX.Element {
  return (
    <ul className="flex flex-col gap-3">
      {tasks.map((task) => {
        const overdue = isOverdue(task.dueDate, task.status);
        return (
          <li key={task.id} className="rounded-md border bg-card p-3 text-card-foreground">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/tasks/${task.id}`} className="min-w-0 break-words py-2 font-medium hover:underline">
                {task.title}
              </Link>
              {isAdmin && <TaskRowActions task={task} isDeleting={isDeleting} onEdit={onEdit} onDelete={onDelete} className="-mr-1 size-10 shrink-0" />}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <StatusBadge status={task.status} />
              <PriorityBadge priority={task.priority} />
            </div>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              {isAdmin && (
                <>
                  <dt className="text-muted-foreground">Assignee</dt>
                  <dd className="min-w-0 break-words">{task.assignee.name}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Due</dt>
              <dd className={cn(overdue && 'font-medium text-destructive')}>
                {formatDueDate(task.dueDate)}
                {overdue && <span className="ml-1 text-xs">(overdue)</span>}
              </dd>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}

/** Table from the `lg` breakpoint up, cards below it. Only one layout is mounted so links and menus are never duplicated in the DOM. */
export function TasksTable({ isDeleting = false, ...rest }: TasksTableProps): React.JSX.Element {
  const isDesktop = useIsDesktop();
  const props = { ...rest, isDeleting };
  return isDesktop ? <TasksTableView {...props} /> : <TasksCardList {...props} />;
}
