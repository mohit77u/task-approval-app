import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import '../types/request.types';
import { resolveError } from './resolve-error';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const resolved = resolveError(exception);

    if (resolved.statusCode >= 500) {
      // Full detail goes to the logs, correlated by request id; the client only ever sees the generic message.
      this.logger.error(
        `[${request.id}] ${request.method} ${request.originalUrl}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(resolved.statusCode).json({
      ...resolved,
      requestId: request.id,
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
    });
  }
}
