import { MoreHorizontal } from 'lucide-react';
import { DisabledReason } from '@/components/common/DisabledReason';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { Task } from '@/types/api';

interface TaskRowActionsProps {
  task: Task;
  /** True while a delete request is in flight; blocks starting a second one. */
  isDeleting: boolean;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  className?: string;
}

/** The per-task Actions menu, shared by the table row and the mobile card so both enforce the same rules. */
export function TaskRowActions({ task, isDeleting, onEdit, onDelete, className }: TaskRowActionsProps): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={cn(className)} aria-label={`Actions for ${task.title}`}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DisabledReason reason={task.status === 'COMPLETED' ? "Completed tasks can't be edited" : undefined} focusable={false}>
          <DropdownMenuItem disabled={task.status === 'COMPLETED'} onSelect={() => onEdit(task)}>
            Edit
          </DropdownMenuItem>
        </DisabledReason>
        <DisabledReason reason={isDeleting ? 'Deleting…' : undefined} focusable={false}>
          <DropdownMenuItem disabled={isDeleting} className="text-destructive focus:text-destructive" onSelect={() => onDelete(task)}>
            Delete
          </DropdownMenuItem>
        </DisabledReason>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
