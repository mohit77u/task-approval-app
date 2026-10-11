import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator';
import { TaskPriority } from '../../../common/enums/task-priority.enum';
import { IsIsoDateOnly } from '../../../common/validators/is-iso-date-only.validator';

export class CreateTaskDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description!: string;

  @IsEnum(TaskPriority)
  priority!: TaskPriority;

  @IsIsoDateOnly()
  dueDate!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  assigneeId!: number;
}
