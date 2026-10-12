import { join } from 'node:path';
import { DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { Env } from '../config/env.validation';
import { RefreshToken } from '../modules/auth/entities/refresh-token.entity';
import { TaskComment } from '../modules/comments/entities/task-comment.entity';
import { TaskStatusHistory } from '../modules/tasks/entities/task-status-history.entity';
import { Task } from '../modules/tasks/entities/task.entity';
import { Role } from '../modules/users/entities/role.entity';
import { User } from '../modules/users/entities/user.entity';

// Each entity lives in its owning module; this is only the registry TypeORM needs.
const ENTITIES = [
  Role,
  User,
  Task,
  TaskComment,
  TaskStatusHistory,
  RefreshToken,
];

export type DbEnv = Pick<
  Env,
  | 'DB_HOST'
  | 'DB_PORT'
  | 'DB_USER'
  | 'DB_PASSWORD'
  | 'DB_NAME'
  | 'DB_SSL'
  | 'DB_SSL_CA'
>;

export function buildDataSourceOptions(db: DbEnv): DataSourceOptions {
  return {
    type: 'mysql',
    host: db.DB_HOST,
    port: db.DB_PORT,
    username: db.DB_USER,
    password: db.DB_PASSWORD,
    database: db.DB_NAME,
    charset: 'utf8mb4',
    timezone: 'Z',
    // Managed MySQL (Aiven) requires TLS. A single-line env var cannot hold newlines, so "\n" is expanded here.
    ssl: db.DB_SSL
      ? { ca: db.DB_SSL_CA?.replace(/\\n/g, '\n'), rejectUnauthorized: true }
      : undefined,
    namingStrategy: new SnakeNamingStrategy(),
    entities: ENTITIES,
    migrations: [join(__dirname, 'migrations', '*{.ts,.js}')],
    // The schema is owned by migrations. Letting TypeORM auto-sync would silently diverge environments.
    synchronize: false,
    migrationsRun: false,
  };
}
