import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { AppException } from '../../../common/errors/app.exception';
import type { AuthUser } from '../../../common/types/request.types';
import { Env } from '../../../config/env.validation';
import {
  ACCESS_COOKIE,
  AuthCookieOptions,
  buildCookieOptions,
  clearOptions,
  REFRESH_COOKIE,
} from '../../security/utils/cookie.options';
import { UserSummary } from '../../users/mappers/user.mapper';
import { AuthService } from '../services/auth.service';
import { LoginDto } from '../dto/login.dto';
import { ClientMeta } from '../services/refresh-token.service';

function readCookie(request: Request, name: string): string | undefined {
  const value: unknown = request.cookies?.[name];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function clientMeta(request: Request): ClientMeta {
  return { userAgent: request.get('user-agent') ?? undefined, ip: request.ip };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly cookies: AuthCookieOptions;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService<Env, true>,
  ) {
    this.cookies = buildCookieOptions({
      secure: config.get('COOKIE_SECURE', { infer: true }),
      sameSite: config.get('COOKIE_SAMESITE', { infer: true }),
      refreshTtlDays: config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true }),
    });
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: UserSummary }> {
    const session = await this.auth.login(
      dto.email,
      dto.password,
      clientMeta(req),
    );
    res.cookie(ACCESS_COOKIE, session.accessToken, this.cookies.access);
    res.cookie(REFRESH_COOKIE, session.refreshToken, this.cookies.refresh);
    return { user: session.user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ refreshed: true }> {
    try {
      const result = await this.auth.refresh(
        readCookie(req, REFRESH_COOKIE),
        clientMeta(req),
      );
      res.cookie(ACCESS_COOKIE, result.accessToken, this.cookies.access);
      if (result.refreshToken)
        res.cookie(REFRESH_COOKIE, result.refreshToken, this.cookies.refresh);
      return { refreshed: true };
    } catch (error) {
      // A dead session must not leave a dead cookie behind, or the client would retry it forever.
      if (error instanceof AppException) this.clearSessionCookies(res);
      throw error;
    }
  }

  // Public on purpose: logging out must work after the access token expired. It only needs the refresh cookie.
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(readCookie(req, REFRESH_COOKIE));
    this.clearSessionCookies(res);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<UserSummary> {
    return this.auth.me(user.id);
  }

  private clearSessionCookies(res: Response): void {
    res.clearCookie(ACCESS_COOKIE, clearOptions(this.cookies.access));
    res.clearCookie(REFRESH_COOKIE, clearOptions(this.cookies.refresh));
  }
}
