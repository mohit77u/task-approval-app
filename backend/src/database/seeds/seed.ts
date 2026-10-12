import { validateEnv } from '../../config/env.validation';
import dataSource from '../data-source';
import { forceUtcSession } from '../utc-session';
import { resolveDemoPasswords } from './demo-data';
import { runSeed } from './run-seed';

async function main(): Promise<void> {
  await dataSource.initialize();
  await forceUtcSession(dataSource);
  try {
    // data-source has already loaded .env into process.env.
    await runSeed(dataSource, {
      sampleTasks: true,
      passwords: resolveDemoPasswords(validateEnv(process.env)),
    });
    console.log('Seed complete.');
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
