'use client';

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useApiAction } from '@/hooks/useApiAction';
import { useAuth } from '@/hooks/useAuth';
import { useConfirm } from '@/hooks/useConfirm';
import { STATUS_LABEL, STATUS_ORDER } from '@/lib/constants';
import { statusHint, transitionCopy } from '@/lib/statusHints';
import { useTransitionTaskMutation } from '@/services/api/tasksApi';
import { RoleCode, Task, TaskStatus } from '@/types/api';

/**
 * The only way to change a task's status. The select is controlled by the server's status and never optimistic, so
 * cancelling the confirmation (or a failed request) leaves it showing the real value with no extra code.
 * Which options are enabled comes from `task.allowedTransitions`; the backend enforces the same rules independently.
 */
export function TaskStatusControl({ task, isFetching = false }: { task: Task; /** True while the task is being refetched, so stale allowedTransitions are never offered. */ isFetching?: boolean }): React.JSX.Element {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [transition] = useTransitionTaskMutation();
  const { run, isPending } = useApiAction();

  // The API types role.code as a plain string; narrow it to the two known roles.
  const code = user?.role.code;
  const role: RoleCode | undefined = code === 'ADMIN' || code === 'EMPLOYEE' ? code : undefined;
  const hint = statusHint(task, role);
  const canChange = task.allowedTransitions.length > 0;

  const isBlocked = (status: TaskStatus): boolean => status !== task.status && !task.allowedTransitions.includes(status);

  const onSelect = async (value: string): Promise<void> => {
    const to = value as TaskStatus;
    if (to === task.status) return;

    const copy = transitionCopy(task.status, to);
    const { confirmed, note } = await confirm({
      title: copy.title,
      description: copy.description,
      confirmLabel: copy.confirmLabel,
      destructive: copy.destructive,
      note: copy.note,
    });
    if (!confirmed) return;

    await run(() => transition({ id: task.id, from: task.status, to, note: note || undefined }).unwrap());
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="task-status">Status</Label>
      <Select value={task.status} onValueChange={(value) => void onSelect(value)} disabled={!canChange || isPending || isFetching}>
        <SelectTrigger id="task-status" className="w-full sm:w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_ORDER.map((status) => (
            <SelectItem
              key={status}
              value={status}
              disabled={isBlocked(status)}
              // Radix disables pointer events on disabled items; re-enable them so the native tooltip can show the reason.
              className="data-disabled:pointer-events-auto"
              title={isBlocked(status) ? `You cannot move this task from ${STATUS_LABEL[task.status]} to ${STATUS_LABEL[status]}.` : undefined}
            >
              {STATUS_LABEL[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}
