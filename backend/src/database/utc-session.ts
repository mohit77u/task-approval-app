import { DataSource } from 'typeorm';
import { MysqlDriver } from 'typeorm/driver/mysql/MysqlDriver';

interface MysqlPool {
  on: (
    event: 'connection',
    listener: (connection: { query: (sql: string) => void }) => void,
  ) => void;
}

const UTC_SESSION_SQL = "SET time_zone = '+00:00'";

/**
 * Columns filled by the database (CURRENT_TIMESTAMP defaults on created_at / updated_at) use the session time zone,
 * while mysql2 is told to read every datetime as UTC. Pinning each pooled connection to UTC makes both agree no matter
 * how the MySQL server is configured (a local XAMPP server is often in the machine's zone, a managed one in UTC).
 * Call right after `initialize()`.
 */
export async function forceUtcSession(dataSource: DataSource): Promise<void> {
  // TypeORM types the mysql2 pool as `any`; only the one method used here is described.
  const pool = (dataSource.driver as MysqlDriver).pool as MysqlPool;
  // Connections created later (the pool grows under load) are configured before they are handed out.
  pool.on('connection', (connection: { query: (sql: string) => void }) =>
    connection.query(UTC_SESSION_SQL),
  );
  // The connection opened during initialize() already exists, so configure the idle ones now.
  await dataSource.query(UTC_SESSION_SQL);
}
