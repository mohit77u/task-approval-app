import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppThrottlerGuard } from '../common/guards/app-throttler.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Env } from '../config/env.validation';
import { PasswordService } from './services/password.service';
import { TokenService } from './services/token.service';

/**
 * Origin and authentication run as middleware (see AppModule). The global guards below run after them, in declaration
 * order: rate limiting (which needs req.user to key by user), then role checks.
 */
@Module({
  imports: [
    JwtModule.register({}),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
        skipIf: () => !config.get('THROTTLING_ENABLED', { infer: true }),
      }),
    }),
  ],
  providers: [
    TokenService,
    PasswordService,
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [TokenService, PasswordService],
})
export class SecurityModule {}
