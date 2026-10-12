import { describe, expect, it } from 'vitest';
import { Task } from '@/types/api';
import { attentionStatuses, mergeAttention } from './attention';

const task = (id: number, dueDate: string): Task => ({ id, dueDate }) as Task;

describe('attentionStatuses', () => {
  it('gives admins submitted work only', () => {
    expect(attentionStatuses(true)).toEqual(['PENDING_APPROVAL']);
  });
  it('gives employees both unstarted and rejected-back work', () => {
    expect(attentionStatuses(false)).toEqual(['PENDING', 'IN_PROGRESS']);
  });
});

describe('mergeAttention', () => {
  it('orders by due date across lists and caps the result', () => {
    const merged = mergeAttention([[task(1, '2030-03-01'), task(2, '2030-01-01')], [task(3, '2030-02-01')]], 2);
    expect(merged.map((t) => t.id)).toEqual([2, 3]);
  });
  it('tolerates lists that have not loaded', () => {
    expect(mergeAttention([undefined, [task(1, '2030-01-01')]]).map((t) => t.id)).toEqual([1]);
  });
});
