import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { Env } from './config/env.validation';
import { setupSwagger } from './swagger.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  // Off by default in production: the docs are a full map of the API surface and nothing there needs them.
  if (config.get('ENABLE_SWAGGER', { infer: true })) setupSwagger(app);
  await app.listen(config.get('PORT', { infer: true }));
}

void bootstrap();
