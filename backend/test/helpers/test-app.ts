import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { Env, validateEnv } from '../../src/config/env.validation';
import { runSeed } from '../../src/database/seeds/run-seed';

export interface TestContext {
  app: INestApplication;
  dataSource: DataSource;
  close: () => Promise<void>;
}

/** Drops everything, re-applies the real migrations and seeds roles and demo users (no sample tasks). */
export async function resetDatabase(dataSource: DataSource): Promise<void> {
  // Safety net: this drops every table. It must never run against a development or production database.
  const database = String(dataSource.options.database ?? '');
  if (!database.endsWith('_test')) {
    throw new Error(
      `Refusing to reset "${database}": e2e tests only run against databases whose name ends in "_test".`,
    );
  }
  await dataSource.dropDatabase();
  await dataSource.runMigrations();
  await runSeed(dataSource, { sampleTasks: false });
}

/** Cheap between-test cleanup: removes task data but keeps users, roles and tokens. */
export async function clearTaskData(dataSource: DataSource): Promise<void> {
  await dataSource.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of ['task_status_history', 'task_comments', 'tasks']) {
    await dataSource.query(`TRUNCATE TABLE ${table}`);
  }
  await dataSource.query('SET FOREIGN_KEY_CHECKS = 1');
}

/**
 * Builds the app exactly as main.ts does against a freshly migrated database. `envOverrides` lets one spec flip a
 * setting (e.g. throttling) without affecting others; previous values are restored on close.
 */
export async function createTestApp(
  envOverrides: Record<string, string> = {},
): Promise<TestContext> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(envOverrides)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }

  // ConfigModule.forRoot validates process.env when app.module is first imported, i.e. before the overrides above are
  // applied. Serving config from a fresh validation of the current env makes `envOverrides` actually take effect.
  const env = validateEnv(process.env);
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ConfigService)
    .useValue({ get: (key: keyof Env) => env[key] })
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  const dataSource = app.get(DataSource);
  await resetDatabase(dataSource);

  return {
    app,
    dataSource,
    close: async () => {
      await app.close();
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
}
