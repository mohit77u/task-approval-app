import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';

export interface TestContext {
  app: INestApplication;
  close: () => Promise<void>;
}

/**
 * Builds the app exactly as main.ts does. `envOverrides` lets one spec flip a setting (e.g. throttling) without
 * touching the others; the previous values are restored on close.
 */
export async function createTestApp(envOverrides: Record<string, string> = {}): Promise<TestContext> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(envOverrides)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();

  return {
    app,
    close: async () => {
      await app.close();
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
}
