import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from './role.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  /** Optional contact number, stored as typed (digits, spaces, +, -, parentheses). */
  @Column({ type: 'varchar', length: 20, nullable: true })
  phone!: string | null;

  /** True for the seeded demo accounts. They can be edited but never deleted. */
  @Column({ type: 'boolean', default: false })
  isDefault!: boolean;

  /**
   * Soft delete, handled by hand (not @DeleteDateColumn): tasks, comments and history keep pointing at the person who
   * did the work, and TypeORM's automatic soft-delete filter would hide those authors from joined queries.
   */
  @Column({ type: 'datetime', nullable: true })
  deletedAt!: Date | null;

  @Column({ type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column()
  roleId!: number;

  // Eager because every authenticated code path needs the role code.
  @ManyToOne(() => Role, { eager: true, nullable: false })
  @JoinColumn({ name: 'role_id' })
  role!: Role;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
