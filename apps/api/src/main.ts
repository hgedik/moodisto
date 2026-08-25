import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { APP_CONFIG } from './config/config.module';
import type { AppConfig } from './config/app-config';

async function bootstrap(): Promise<void> {
  // `rawBody` is required: payment webhook signatures are computed over the exact bytes the PSP
  // sent, so a re-serialised JSON body would never verify.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bufferLogs: true,
  });
  const config = app.get<AppConfig>(APP_CONFIG);

  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.set('trust proxy', 1);
  app.use(cookieParser());
  app.use(
    helmet({
      // The API serves JSON only; the embedded player's CSP belongs to the web app that renders it.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );
  app.enableCors({
    origin: [...config.corsOrigins],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    maxAge: 600,
  });
  // Request payloads are validated per route with Zod schemas shared with the web app, so no
  // class-validator based global pipe is registered here.
  app.enableShutdownHooks();

  await app.listen(config.port, '0.0.0.0');
  new Logger('Bootstrap').log(
    `Moodisto API ${config.apiUrl} adresinde ${config.nodeEnv} modunda çalışıyor.`,
  );
}

void bootstrap();
