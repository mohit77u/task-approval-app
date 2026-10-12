import { INestApplication, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Env } from './config/env.validation';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { createValidationPipe } from './common/pipes/validation.pipe';

/**
 * Everything that makes the HTTP surface behave correctly. Shared by main.ts and the e2e suite so tests exercise the
 * exact production configuration.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // Requests reach Render through Vercel, so Express must know how many proxy hops to trust for protocol and client IP.
  (app as NestExpressApplication).set(
    'trust proxy',
    config.get('TRUST_PROXY_HOPS', { infer: true }),
  );

  app.setGlobalPrefix('api');
  // URI versioning: routes are served at /api/v1/...; a breaking change ships as v2 next to v1.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.get('FRONTEND_ORIGINS', { infer: true }),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'X-Request-Id'],
    maxAge: 600,
  });
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
}
