import { describe, expect, it } from 'vitest';
import { formatDueDate, isOverdue } from './dates';

describe('formatDueDate', () => {
  it('formats a calendar date without shifting it across time zones', () => {
    expect(formatDueDate('2030-01-05')).toBe('05 Jan 2030');
    expect(formatDueDate('2030-12-31')).toBe('31 Dec 2030');
  });
});

describe('isOverdue', () => {
  const today = '2030-06-15';

  it('is overdue only when the due date is before today and the task is not completed', () => {
    expect(isOverdue('2030-06-14', 'IN_PROGRESS', today)).toBe(true);
    expect(isOverdue('2030-06-14', 'PENDING_APPROVAL', today)).toBe(true);
  });

  it('is not overdue on the due date itself', () => {
    expect(isOverdue('2030-06-15', 'PENDING', today)).toBe(false);
  });

  it('is not overdue in the future or once completed', () => {
    expect(isOverdue('2030-06-16', 'PENDING', today)).toBe(false);
    expect(isOverdue('2020-01-01', 'COMPLETED', today)).toBe(false);
  });
});
