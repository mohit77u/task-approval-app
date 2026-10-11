import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator';
import { TaskStatus } from '../../../common/enums/task-status.enum';

export class TransitionTaskDto {
  @IsEnum(TaskStatus)
  to!: TaskStatus;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
