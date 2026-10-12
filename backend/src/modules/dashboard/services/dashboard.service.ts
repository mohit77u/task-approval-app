import { Injectable } from '@nestjs/common';
import { TaskStatus } from '../../../common/enums/task-status.enum';
import { AuthUser } from '../../../common/types/request.types';
import { TasksService } from '../../tasks/services/tasks.service';

export interface DashboardResponse {
  counts: Record<TaskStatus, number>;
  total: number;
}

@Injectable()
export class DashboardService {
  constructor(private readonly tasks: TasksService) {}

  async getCounts(user: AuthUser): Promise<DashboardResponse> {
    // Built on the same scoped query as the task list, so the numbers can never disagree with what the user can open.
    const rows = await this.tasks
      .createScopedQuery(user)
      .select('task.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('task.status')
      .getRawMany<{ status: TaskStatus; count: string }>();

    const counts = Object.values(TaskStatus).reduce(
      (acc, status) => ({ ...acc, [status]: 0 }),
      {} as Record<TaskStatus, number>,
    );
    for (const row of rows) counts[row.status] = Number(row.count);

    return {
      counts,
      total: Object.values(counts).reduce((sum, value) => sum + value, 0),
    };
  }
}
