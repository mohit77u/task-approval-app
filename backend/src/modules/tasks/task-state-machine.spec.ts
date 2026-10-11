import { RoleCode } from '../../common/enums/role-code.enum';
import { TaskStatus as S } from '../../common/enums/task-status.enum';
import { allowedTargets, evaluateTransition } from './task-state-machine';

const ALL = Object.values(S);

describe('evaluateTransition', () => {
  const allowedCases: Array<[string, RoleCode, boolean, S, S, string | undefined]> = [
    ['assignee starts a task', RoleCode.EMPLOYEE, true, S.PENDING, S.IN_PROGRESS, undefined],
    ['assignee submits for approval', RoleCode.EMPLOYEE, true, S.IN_PROGRESS, S.PENDING_APPROVAL, undefined],
    ['admin approves', RoleCode.ADMIN, false, S.PENDING_APPROVAL, S.COMPLETED, undefined],
    ['admin rejects with a reason', RoleCode.ADMIN, false, S.PENDING_APPROVAL, S.IN_PROGRESS, 'Needs more detail'],
  ];
  it.each(allowedCases)('allows: %s', (_name, role, isAssignee, from, to, note) => {
    expect(evaluateTransition({ role, isAssignee, from, to, note })).toEqual({ allowed: true });
  });

  it('rejects an approval attempted by the assigned employee (forbidden actor)', () => {
    expect(evaluateTransition({ role: RoleCode.EMPLOYEE, isAssignee: true, from: S.PENDING_APPROVAL, to: S.COMPLETED })).toEqual({
      allowed: false,
      reason: 'FORBIDDEN',
    });
  });

  it('rejects an admin performing the employee steps', () => {
    for (const [from, to] of [
      [S.PENDING, S.IN_PROGRESS],
      [S.IN_PROGRESS, S.PENDING_APPROVAL],
    ] as const) {
      expect(evaluateTransition({ role: RoleCode.ADMIN, isAssignee: false, from, to })).toEqual({ allowed: false, reason: 'FORBIDDEN' });
    }
  });

  it('rejects an employee who is not the assignee', () => {
    expect(evaluateTransition({ role: RoleCode.EMPLOYEE, isAssignee: false, from: S.PENDING, to: S.IN_PROGRESS })).toEqual({
      allowed: false,
      reason: 'FORBIDDEN',
    });
  });

  it('requires a non-blank note to reject', () => {
    for (const note of [undefined, null, '', '   ']) {
      expect(evaluateTransition({ role: RoleCode.ADMIN, isAssignee: false, from: S.PENDING_APPROVAL, to: S.IN_PROGRESS, note })).toEqual({
        allowed: false,
        reason: 'NOTE_REQUIRED',
      });
    }
  });

  it('treats every pair without a rule as INVALID_TRANSITION, whoever asks', () => {
    const ruled = new Set(['PENDING>IN_PROGRESS', 'IN_PROGRESS>PENDING_APPROVAL', 'PENDING_APPROVAL>COMPLETED', 'PENDING_APPROVAL>IN_PROGRESS']);
    for (const from of ALL) {
      for (const to of ALL) {
        if (ruled.has(`${from}>${to}`)) continue;
        for (const [role, isAssignee] of [[RoleCode.ADMIN, false], [RoleCode.EMPLOYEE, true]] as const) {
          expect(evaluateTransition({ role, isAssignee, from, to, note: 'x' })).toEqual({ allowed: false, reason: 'INVALID_TRANSITION' });
        }
      }
    }
  });

  it('never allows leaving COMPLETED', () => {
    for (const to of ALL) {
      expect(evaluateTransition({ role: RoleCode.ADMIN, isAssignee: false, from: S.COMPLETED, to, note: 'x' }).allowed).toBe(false);
    }
  });
});

describe('allowedTargets', () => {
  it('lists what each viewer may do next', () => {
    expect(allowedTargets({ role: RoleCode.EMPLOYEE, isAssignee: true }, S.PENDING)).toEqual([S.IN_PROGRESS]);
    expect(allowedTargets({ role: RoleCode.EMPLOYEE, isAssignee: true }, S.IN_PROGRESS)).toEqual([S.PENDING_APPROVAL]);
    expect(allowedTargets({ role: RoleCode.EMPLOYEE, isAssignee: true }, S.PENDING_APPROVAL)).toEqual([]);
    expect(allowedTargets({ role: RoleCode.ADMIN, isAssignee: false }, S.PENDING_APPROVAL).sort()).toEqual([S.COMPLETED, S.IN_PROGRESS].sort());
    expect(allowedTargets({ role: RoleCode.ADMIN, isAssignee: false }, S.PENDING)).toEqual([]);
    expect(allowedTargets({ role: RoleCode.ADMIN, isAssignee: false }, S.COMPLETED)).toEqual([]);
  });

  it('offers nothing to an employee who is not the assignee', () => {
    expect(allowedTargets({ role: RoleCode.EMPLOYEE, isAssignee: false }, S.PENDING)).toEqual([]);
  });
});
