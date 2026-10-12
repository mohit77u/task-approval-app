import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../../common/types/request.types';
import { TaskIdPipe } from '../../tasks/controllers/tasks.controller';
import { CommentResponse, CommentsService } from '../services/comments.service';
import { CreateCommentDto } from '../dto/create-comment.dto';

@ApiTags('comments')
@Controller('tasks/:id/comments')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param('id', TaskIdPipe) id: number,
  ): Promise<CommentResponse[]> {
    return this.comments.list(user, id);
  }

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  create(
    @CurrentUser() user: AuthUser,
    @Param('id', TaskIdPipe) id: number,
    @Body() dto: CreateCommentDto,
  ): Promise<CommentResponse> {
    return this.comments.create(user, id, dto.body);
  }
}
