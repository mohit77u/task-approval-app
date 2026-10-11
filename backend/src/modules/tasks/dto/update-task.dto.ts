import { PartialType } from '@nestjs/swagger';
import { CreateTaskDto } from './create-task.dto';

/** Every field optional. Status is intentionally absent: it only changes through the transition endpoint. */
export class UpdateTaskDto extends PartialType(CreateTaskDto) {}
