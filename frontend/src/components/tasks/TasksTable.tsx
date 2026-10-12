import { MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { PriorityBadge } from '@/components/common/PriorityBadge';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDueDate, isOverdue } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { Task } from '@/types/api';

interface TasksTableProps {
  tasks: Task[];
  isAdmin: boolean;
  /** True while a delete request is in flight; blocks starting a second one. */
  isDeleting?: boolean;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

export function TasksTable({ tasks, isAdmin, isDeleting = false, onEdit, onDelete }: TasksTableProps): React.JSX.Element {
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Actions for ${task.title}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem disabled={task.status === 'COMPLETED'} onSelect={() => onEdit(task)}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={isDeleting} className="text-destructive focus:text-destructive" onSelect={() => onDelete(task)}>
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
