import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import '../types/request.types';

const MAX_INCOMING_ID_LENGTH = 100;

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const incoming = request.header('x-request-id');
    // Honour an upstream id (e.g. from the Vercel proxy) for end-to-end tracing, but never trust unbounded input.
    request.id = incoming && incoming.length <= MAX_INCOMING_ID_LENGTH ? incoming : randomUUID();
    response.setHeader('X-Request-Id', request.id);
    next();
  }
}
