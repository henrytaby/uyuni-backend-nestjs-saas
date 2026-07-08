import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { LevelWithSilent } from 'pino';

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const logLevel = configService.get<string>('LOG_LEVEL', 'info');
        const isDev =
          configService.get<string>('NODE_ENV', 'development') ===
          'development';
        return {
          pinoHttp: {
            level: logLevel,
            transport: isDev
              ? {
                  target: 'pino-pretty',
                  options: { colorize: true, singleLine: false },
                }
              : undefined,
            genReqId: (req: IncomingMessage, res: ServerResponse) => {
              const existingId = (req as { id?: string }).id;
              if (existingId) return existingId;
              const newId = randomUUID();
              (res as { id?: string }).id = newId;
              return newId;
            },
            customLogLevel: (
              _req: IncomingMessage,
              res: ServerResponse,
              err?: Error,
            ): LevelWithSilent => {
              if (err || res.statusCode >= 500) return 'error';
              if (res.statusCode >= 400) return 'warn';
              return 'info';
            },
            serializers: {
              req: (req: IncomingMessage) => ({
                id: (req as { id?: string }).id,
                method: req.method,
                url: req.url,
                remoteAddress: req.socket?.remoteAddress ?? null,
              }),
              res: (res: ServerResponse) => ({
                statusCode: res.statusCode,
              }),
            },
            customProps: (req: IncomingMessage) => ({
              requestId: (req as { id?: string }).id ?? null,
              ip:
                (req as { ip?: string }).ip ??
                req.socket?.remoteAddress ??
                null,
              tenantId: null,
              userId: null,
            }),
          },
        };
      },
    }),
  ],
})
export class LoggerModule {}
