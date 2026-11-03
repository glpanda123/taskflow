/**
 * Errors as RFC 9457 problem details (application/problem+json), the shape the
 * contract's Problem and ValidationProblem schemas describe.
 */
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';

export type FieldError = { field: string; message: string };

export class ProblemException extends Error {
  constructor(
    readonly status: number,
    readonly kind: string,
    readonly title: string,
    readonly detail?: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(detail ?? title);
  }
}

export const unauthorized = (detail = 'Missing, invalid or expired credentials') =>
  new ProblemException(401, 'unauthorized', 'Authentication required', detail);

export const validationFailed = (errors: FieldError[]) =>
  new ProblemException(422, 'validation-error', 'Invalid request', undefined, { errors });

@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    let body: Record<string, unknown>;
    if (error instanceof ProblemException) {
      body = {
        type: `https://taskflow.dev/problems/${error.kind}`,
        title: error.title,
        status: error.status,
        ...(error.detail ? { detail: error.detail } : {}),
        ...error.extra,
      };
    } else if (error instanceof HttpException) {
      // Nest's own errors (unknown route → 404, malformed JSON → 400).
      body = {
        type: 'about:blank',
        title: error.message,
        status: error.getStatus(),
      };
    } else {
      // Never leak internals; log them instead.
      console.error(error);
      body = {
        type: 'about:blank',
        title: 'Internal Server Error',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      };
    }

    res
      .status(body.status as number)
      .type('application/problem+json')
      .json({ ...body, instance: req.originalUrl });
  }
}
