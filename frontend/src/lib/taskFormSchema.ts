import { z } from 'zod';
import { todayAsDateString } from '@/lib/dates';

/**
 * Task form rules. `initialDueDate` is set when editing: an already-past due date stays valid until the user
 * changes it, so unrelated edits to an overdue task are not blocked. `today` is injectable for tests.
 */
export function makeTaskSchema(initialDueDate?: string, today: () => string = todayAsDateString) {
  return z.object({
    title: z.string().trim().min(1, 'Enter a title').max(200, 'Keep the title under 200 characters'),
    description: z.string().trim().min(1, 'Enter a description').max(5000, 'Keep the description under 5000 characters'),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a due date')
      // ISO date strings compare correctly as text; typed dates bypass the picker's `min`, so check here too.
      .refine((value) => value === initialDueDate || value >= today(), "Due date can't be in the past"),
    // Kept as a string because the Select works with strings; converted to a number on submit.
    assigneeId: z.string().min(1, 'Choose an employee'),
  });
}
export type TaskFormValues = z.infer<ReturnType<typeof makeTaskSchema>>;
