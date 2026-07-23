import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import type { Express, Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter.js';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const trustProxy = configService.get<boolean>('TRUST_PROXY', false);
  const rawOrigins = configService.get<string>('CORS_ORIGINS', '');

  const expressInstance = app.getHttpAdapter().getInstance() as Express;
  app.use(helmet());
  app.use(cookieParser());
  expressInstance.set('trust proxy', trustProxy);

  // Single CORS owner (T037): parse comma-separated origins from env.
  const allowedOrigins = rawOrigins
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
  app.enableCors({ origin: allowedOrigins, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const httpAdapterHost = app.get(HttpAdapterHost);
  app.useGlobalFilters(
    new GlobalExceptionFilter(httpAdapterHost, configService),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Uyuni SaaS Backend')
    .setDescription(
      'REST API for the Uyuni SaaS platform — foundation (spec 001).',
    )
    .setVersion('0.0.1')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'bearer', // This name here is important for matching up with @ApiBearerAuth() in your controller!
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('/api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
    customSiteTitle: 'Uyuni API Docs',
  });
  expressInstance.get('/api/docs-json', (_req: Request, res: Response) => {
    res.json(document);
  });

  await app.listen(port);
  logger.log(`Uyuni backend listening on http://localhost:${port}`);
  logger.log(`Swagger UI at http://localhost:${port}/api/docs`);
  logger.log(`OpenAPI JSON at http://localhost:${port}/api/docs-json`);
}

void bootstrap().catch((error: unknown) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(
    JSON.stringify({ level: 'error', msg: `Bootstrap failed: ${msg}` }),
  );
  process.exit(1);
});
