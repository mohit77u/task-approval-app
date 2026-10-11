import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthUser } from '../../common/types/request.types';
import { TaskComment } from '../../database/entities';
import { TasksService } from '../tasks/tasks.service';

export interface CommentResponse {
  id: number;
  body: string;
  author: { id: number; name: string };
  createdAt: Date;
}

/** Upper bound for one task's thread; real tasks stay far below it, and it keeps a response from growing without limit. */
const MAX_COMMENTS_PER_RESPONSE = 500;

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(TaskComment) private readonly comments: Repository<TaskComment>,
    private readonly tasks: TasksService,
  ) {}

  async list(user: AuthUser, taskId: number): Promise<CommentResponse[]> {
    await this.tasks.getForViewer(user, taskId); // 404 for tasks outside the viewer's scope
    const rows = await this.comments.find({
      where: { taskId },
      relations: { author: true },
      order: { createdAt: 'ASC', id: 'ASC' },
      take: MAX_COMMENTS_PER_RESPONSE,
    });
    return rows.map(this.toResponse);
  }

  async create(user: AuthUser, taskId: number, body: string): Promise<CommentResponse> {
    await this.tasks.getForViewer(user, taskId);
    const saved = await this.comments.save(this.comments.create({ taskId, authorId: user.id, body }));
    const row = await this.comments.findOneOrFail({ where: { id: saved.id }, relations: { author: true } });
    return this.toResponse(row);
  }

  private toResponse(row: TaskComment): CommentResponse {
    return { id: row.id, body: row.body, author: { id: row.author.id, name: row.author.name }, createdAt: row.createdAt };
  }
}
