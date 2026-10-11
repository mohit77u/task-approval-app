import { Agent } from './auth';

export interface TaskBody {
  id: number;
  title: string;
  status: string;
  priority: string;
  dueDate: string;
  assignee: { id: number; name: string; email: string };
  allowedTransitions: string[];
  [key: string]: unknown;
}

/** Creates a task as the given admin agent and returns the response body. */
export async function createTask(
  admin: Agent,
  assigneeId: number,
  overrides: Partial<{
    title: string;
    description: string;
    priority: string;
    dueDate: string;
  }> = {},
): Promise<TaskBody> {
  const res = await admin
    .post('/api/tasks')
    .send({
      title: 'Prepare quarterly report',
      description: 'Collect figures from every team.',
      priority: 'MEDIUM',
      dueDate: '2030-01-15',
      assigneeId,
      ...overrides,
    })
    .expect(201);
  return res.body as TaskBody;
}
