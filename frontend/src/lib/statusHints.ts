import { STATUS_LABEL } from '@/lib/constants';
import { PersonRef, RoleCode, Task, TaskStatus } from '@/types/api';

export interface TransitionCopy {
  title: string;
  description: string;
  confirmLabel: string;
  destructive: boolean;
  note: { label: string; required: boolean; placeholder?: string };
}

const OPTIONAL_NOTE = { label: 'Note (optional)', required: false, placeholder: 'Add context for the history log' } as const;

/** Wording for the confirmation dialog of each workflow step. The from → to line is always shown so nothing changes silently. */
export function transitionCopy(from: TaskStatus, to: TaskStatus): TransitionCopy {
  const change = `${STATUS_LABEL[from]} → ${STATUS_LABEL[to]}`;

  if (from === 'PENDING_APPROVAL' && to === 'IN_PROGRESS') {
    return {
      title: 'Send this task back to In Progress?',
      description: `${change}. The assignee will see your reason and can resubmit.`,
      confirmLabel: 'Reject',
      destructive: true,
      note: { label: 'Reason for rejection', required: true, placeholder: 'What needs to change?' },
    };
  }
  if (from === 'PENDING_APPROVAL' && to === 'COMPLETED') {
    return { title: 'Approve this task?', description: `${change}. Completed tasks cannot be changed afterwards.`, confirmLabel: 'Approve', destructive: false, note: OPTIONAL_NOTE };
  }
  if (from === 'IN_PROGRESS' && to === 'PENDING_APPROVAL') {
    return { title: 'Submit for approval?', description: `${change}. An admin will review your work.`, confirmLabel: 'Submit', destructive: false, note: OPTIONAL_NOTE };
  }
  if (from === 'PENDING' && to === 'IN_PROGRESS') {
    return { title: 'Start working on this task?', description: change, confirmLabel: 'Start', destructive: false, note: OPTIONAL_NOTE };
  }
  return { title: `Move task to ${STATUS_LABEL[to]}?`, description: change, confirmLabel: 'Confirm', destructive: false, note: OPTIONAL_NOTE };
}

type HintTask = Pick<Task, 'status' | 'allowedTransitions'> & { assignee: PersonRef };

/** Explains, in plain words, why the status dropdown is disabled. Null when the viewer can act. */
export function statusHint(task: HintTask, role: RoleCode | undefined): string | null {
  if (task.status === 'COMPLETED') return 'Completed tasks are final.';
  if (task.allowedTransitions.length > 0) return null;
  if (role === 'ADMIN') return `Waiting for ${task.assignee.name}. Only the assignee can move this task forward.`;
  if (role === 'EMPLOYEE' && task.status === 'PENDING_APPROVAL') return 'Waiting for an admin to approve or reject this task.';
  return null;
}
