import dataSource from '../data-source';
import { forceUtcSession } from '../utc-session';
import { runSeed } from './run-seed';

async function main(): Promise<void> {
  await dataSource.initialize();
  await forceUtcSession(dataSource);
  try {
    await runSeed(dataSource, { sampleTasks: true });
    console.log('Seed complete.');
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
