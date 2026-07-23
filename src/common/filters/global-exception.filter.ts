import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { ThrottlerException } from '@nestjs/throttler';

interface NormalizedError {
  statusCode: number;
  message: string | string[];
  error: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  private readonly httpAdapter: HttpAdapterHost['httpAdapter'];

  private readonly rateLimitTtl: number;

  constructor(httpAdapterHost: HttpAdapterHost, configService: ConfigService) {
    this.httpAdapter = httpAdapterHost.httpAdapter;
    this.rateLimitTtl = configService.get<number>('RATE_LIMIT_TTL', 60);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();

    const normalized = this.normalize(exception);
    const requestId = request.id ?? null;
    const timestamp = new Date().toISOString();
    const path = request.url;

    const body: Record<string, unknown> = {
      statusCode: normalized.statusCode,
      message: normalized.message,
      error: normalized.error,
      timestamp,
      path,
      requestId,
    };

    if (normalized.statusCode === 429) {
      response.setHeader('Retry-After', String(this.rateLimitTtl));
    }
    const method = request.method;
    const url = request.url;
    if (normalized.statusCode >= 500) {
      this.logger.error(
        `[${requestId ?? '-'}] ${method} ${url} -> ${normalized.statusCode} ${normalized.error}`,
      );
    } else if (normalized.statusCode >= 400) {
      this.logger.warn(
        `[${requestId ?? '-'}] ${method} ${url} -> ${normalized.statusCode} ${normalized.error}`,
      );
    }
    void this.httpAdapter;

    response.status(normalized.statusCode).json(body);
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof ZodError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        message: exception.issues.map(
          (i) => `${i.path.join('.')}: ${i.message}`,
        ),
        error: 'Bad Request',
      };
    }

    if (exception instanceof ThrottlerException) {
      return {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'ThrottlerException: Too Many Requests',
        error: 'Too Many Requests',
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      let message: string | string[];
      let error: string;
      if (typeof res === 'string') {
        message = res;
        error = exception.name;
      } else if (typeof res === 'object' && res !== null) {
        const r = res as { message?: string | string[]; error?: string };
        message = r.message ?? exception.message;
        error = r.error ?? String(HttpStatus[status] ?? exception.name);
      } else {
        message = exception.message;
        error = exception.name;
      }
      return { statusCode: status, message, error };
    }

    if (
      exception instanceof Error &&
      exception.name === 'PrismaClientKnownRequestError'
    ) {
      const prismaError = exception as {
        code?: string;
        meta?: { target?: string[] };
      };
      if (prismaError.code === 'P2002') {
        const target = prismaError.meta?.target ?? [];
        const field = target.join(', ');
        return {
          statusCode: HttpStatus.CONFLICT,
          message: `Unique constraint violation on ${field}`,
          error: 'Conflict',
        };
      }
      // P2025 (record not found) → 404 (not 403)
      if (prismaError.code === 'P2025') {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Record not found',
          error: 'Not Found',
        };
      }
    }

    const message =
      exception instanceof Error ? exception.message : String(exception);
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message,
      error: 'Internal Server Error',
    };
  }
}
