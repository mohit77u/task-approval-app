import { describe, expect, it } from 'vitest';
import { makeTaskSchema } from '@/lib/taskFormSchema';

const base = { title: 't', description: 'd', priority: 'LOW', assigneeId: '1' };
const today = (): string => '2026-10-12';

describe('task form due date', () => {
  it('rejects yesterday and accepts today on create', () => {
    const schema = makeTaskSchema(undefined, today);
    expect(schema.safeParse({ ...base, dueDate: '2026-10-11' }).success).toBe(false);
    expect(schema.safeParse({ ...base, dueDate: '2026-10-12' }).success).toBe(true);
  });

  it('keeps an unchanged past date valid on edit but rejects a new past date', () => {
    const schema = makeTaskSchema('2026-01-01', today);
    expect(schema.safeParse({ ...base, dueDate: '2026-01-01' }).success).toBe(true);
    expect(schema.safeParse({ ...base, dueDate: '2026-02-02' }).success).toBe(false);
    expect(schema.safeParse({ ...base, dueDate: '2026-11-01' }).success).toBe(true);
  });
});
