import { describe, expect, it } from 'vitest';
import { statusHint, transitionCopy } from './statusHints';

const assignee = { id: 2, name: 'Priya Sharma', email: 'priya@taskapp.dev' };

describe('transitionCopy', () => {
  it('asks for a required reason when rejecting', () => {
    const copy = transitionCopy('PENDING_APPROVAL', 'IN_PROGRESS');
    expect(copy).toMatchObject({ confirmLabel: 'Reject', destructive: true, note: { required: true } });
    expect(copy.note.label).toMatch(/reason/i);
  });

  it('words each normal step and keeps the note optional', () => {
    expect(transitionCopy('PENDING', 'IN_PROGRESS')).toMatchObject({ confirmLabel: 'Start', destructive: false, note: { required: false } });
    expect(transitionCopy('IN_PROGRESS', 'PENDING_APPROVAL')).toMatchObject({ confirmLabel: 'Submit' });
    expect(transitionCopy('PENDING_APPROVAL', 'COMPLETED')).toMatchObject({ confirmLabel: 'Approve' });
  });

  it('always states the from → to change in the description', () => {
    expect(transitionCopy('PENDING', 'IN_PROGRESS').description).toContain('Pending → In Progress');
    expect(transitionCopy('PENDING_APPROVAL', 'COMPLETED').description).toContain('Pending Approval → Completed');
  });
});

describe('statusHint', () => {
  it('stays silent when the viewer can act', () => {
    expect(statusHint({ status: 'PENDING', allowedTransitions: ['IN_PROGRESS'], assignee }, 'EMPLOYEE')).toBeNull();
  });

  it('explains why nothing can be changed', () => {
    expect(statusHint({ status: 'COMPLETED', allowedTransitions: [], assignee }, 'ADMIN')).toBe('Completed tasks are final.');
    expect(statusHint({ status: 'IN_PROGRESS', allowedTransitions: [], assignee }, 'ADMIN')).toContain('Priya Sharma');
    expect(statusHint({ status: 'PENDING_APPROVAL', allowedTransitions: [], assignee }, 'EMPLOYEE')).toMatch(/admin/i);
  });
});
