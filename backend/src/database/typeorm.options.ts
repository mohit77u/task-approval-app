import { join } from 'node:path';
import { DataSourceOptions } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { Env } from '../config/env.validation';
import { ENTITIES } from './entities';

export type DbEnv = Pick<Env, 'DB_HOST' | 'DB_PORT' | 'DB_USER' | 'DB_PASSWORD' | 'DB_NAME' | 'DB_SSL' | 'DB_SSL_CA'>;

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
    ssl: db.DB_SSL ? { ca: db.DB_SSL_CA?.replace(/\\n/g, '\n'), rejectUnauthorized: true } : undefined,
    namingStrategy: new SnakeNamingStrategy(),
    entities: ENTITIES,
    migrations: [join(__dirname, 'migrations', '*{.ts,.js}')],
    // The schema is owned by migrations. Letting TypeORM auto-sync would silently diverge environments.
    synchronize: false,
    migrationsRun: false,
  };
}
