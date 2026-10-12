import { INestApplication, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Env } from './config/env.validation';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { bodyParserErrorMiddleware } from './common/errors/body-parser-error';
import { requestIdMiddleware } from './common/middleware/request-id.middleware';
import { createValidationPipe } from './common/pipes/validation.pipe';

/**
 * Everything that makes the HTTP surface behave correctly. Kept in one place so any future HTTP-level test can
 * exercise the exact production configuration.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const expressApp = app as NestExpressApplication;

  // First, so every response (including body-parser failures and 404s outside /api) carries a request id.
  app.use(requestIdMiddleware);

  // Requests reach Render through Vercel, so Express must know how many proxy hops to trust for protocol and client IP.
  expressApp.set(
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
  // Registered here instead of by Nest at init (Nest skips parsers that are already mounted), so the error middleware
  // below can sit right after them and map their failures to the error contract. After CORS so those errors still
  // carry CORS headers.
  expressApp.useBodyParser('json');
  expressApp.useBodyParser('urlencoded', { extended: true });
  app.use(bodyParserErrorMiddleware);
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
}
