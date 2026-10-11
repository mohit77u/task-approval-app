import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TaskPriority } from '../../common/enums/task-priority.enum';
import { TaskStatus } from '../../common/enums/task-status.enum';
import { User } from './user.entity';

@Entity('tasks')
@Index(['assigneeId', 'status'])
@Index(['status', 'priority'])
@Index(['dueDate'])
export class Task {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'enum', enum: TaskPriority, default: TaskPriority.MEDIUM })
  priority!: TaskPriority;

  @Column({ type: 'enum', enum: TaskStatus, default: TaskStatus.PENDING })
  status!: TaskStatus;

  /** Calendar date as `YYYY-MM-DD`. Kept as a string so it never shifts across time zones. */
  @Column({ type: 'date' })
  dueDate!: string;

  @Column()
  assigneeId!: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'assignee_id' })
  assignee!: User;

  @Column()
  createdById!: number;

  @ManyToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'created_by_id' })
  createdBy!: User;

  /** Soft delete keeps comments and history intact for audit. */
  @DeleteDateColumn()
  deletedAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
