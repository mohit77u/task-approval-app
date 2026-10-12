import { RoleCode } from '../../../common/enums/role-code.enum';
import { TaskStatus } from '../../../common/enums/task-status.enum';

type Actor = 'ASSIGNED_EMPLOYEE' | 'ADMIN';

interface TransitionRule {
  from: TaskStatus;
  to: TaskStatus;
  actor: Actor;
  noteRequired: boolean;
}

/** The single source of truth for the workflow. Frontend permissions are derived from it, never duplicated. */
export const TRANSITION_RULES: readonly TransitionRule[] = [
  {
    from: TaskStatus.PENDING,
    to: TaskStatus.IN_PROGRESS,
    actor: 'ASSIGNED_EMPLOYEE',
    noteRequired: false,
  },
  {
    from: TaskStatus.IN_PROGRESS,
    to: TaskStatus.PENDING_APPROVAL,
    actor: 'ASSIGNED_EMPLOYEE',
    noteRequired: false,
  },
  {
    from: TaskStatus.PENDING_APPROVAL,
    to: TaskStatus.COMPLETED,
    actor: 'ADMIN',
    noteRequired: false,
  },
  // Rejection sends the task back to the employee, who needs to know why.
  {
    from: TaskStatus.PENDING_APPROVAL,
    to: TaskStatus.IN_PROGRESS,
    actor: 'ADMIN',
    noteRequired: true,
  },
];

export interface Viewer {
  role: RoleCode;
  isAssignee: boolean;
}

export interface TransitionContext extends Viewer {
  from: TaskStatus;
  to: TaskStatus;
  note?: string | null;
}

export type TransitionDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: 'INVALID_TRANSITION' | 'FORBIDDEN' | 'NOTE_REQUIRED';
    };

function isPermittedActor(rule: TransitionRule, viewer: Viewer): boolean {
  return rule.actor === 'ADMIN'
    ? viewer.role === RoleCode.ADMIN
    : viewer.role === RoleCode.EMPLOYEE && viewer.isAssignee;
}

export function evaluateTransition(ctx: TransitionContext): TransitionDecision {
  const rule = TRANSITION_RULES.find(
    (r) => r.from === ctx.from && r.to === ctx.to,
  );
  if (!rule) return { allowed: false, reason: 'INVALID_TRANSITION' };
  if (!isPermittedActor(rule, ctx))
    return { allowed: false, reason: 'FORBIDDEN' };
  if (rule.noteRequired && !ctx.note?.trim())
    return { allowed: false, reason: 'NOTE_REQUIRED' };
  return { allowed: true };
}

/** Statuses the viewer may move a task to right now. Sent to the client so the UI never re-implements the rules. */
export function allowedTargets(viewer: Viewer, from: TaskStatus): TaskStatus[] {
  return TRANSITION_RULES.filter(
    (rule) => rule.from === from && isPermittedActor(rule, viewer),
  ).map((rule) => rule.to);
}
