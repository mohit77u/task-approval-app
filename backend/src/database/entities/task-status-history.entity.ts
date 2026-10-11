import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TaskStatus } from '../../common/enums/task-status.enum';
import { Task } from './task.entity';
import { User } from './user.entity';

@Entity('task_status_history')
@Index(['taskId', 'createdAt'])
export class TaskStatusHistory {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  taskId!: number;

  @ManyToOne(() => Task, { nullable: false })
  @JoinColumn({ name: 'task_id' })
  task!: Task;

  /** Null for the row written when the task is created. */
  @Column({ type: 'enum', enum: TaskStatus, nullable: true })
  fromStatus!: TaskStatus | null;

  @Column({ type: 'enum', enum: TaskStatus })
  toStatus!: TaskStatus;

  @Column()
  actorId!: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'actor_id' })
  actor!: User;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  note!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
