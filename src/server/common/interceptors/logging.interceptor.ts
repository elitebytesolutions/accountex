import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { REQUEST_ID_HEADER } from '../middleware/request-id.middleware.js';
import type { AuthenticatedRequest } from '../decorators/current-user.decorator.js';

/** Logs one line per API request once the response has been sent (so the final status is known). */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & Partial<AuthenticatedRequest>>();
    const res = http.getResponse<Response>();
    const started = performance.now();

    res.once('finish', () => {
      const ms = Math.round(performance.now() - started);
      const user = req.user ? ` user=${req.user.id}` : '';
      this.logger.log(
        `${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms rid=${req.header(REQUEST_ID_HEADER)}${user}`,
      );
    });
    return next.handle();
  }
}
