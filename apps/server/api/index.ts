import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import cookieParser from 'cookie-parser';

// Catch any unhandled rejections so they appear in Vercel Runtime Logs
process.on('unhandledRejection', (reason, promise) => {
  console.error('[unhandledRejection]', promise, 'reason:', reason);
});

const expressApp = express();
let cachedApp: any;

async function bootstrap() {
  if (!cachedApp) {
    const app = await NestFactory.create(
      AppModule,
      new ExpressAdapter(expressApp),
    );

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );

    app.use(cookieParser());

    app.enableCors({
      origin: [
        'https://deepkhata.vercel.app',
        'https://agency-admin-deepkhata.vercel.app',
        'http://localhost:3000',
        'http://localhost:3001',
      ],
      credentials: true,
    });

    await app.init();
    cachedApp = expressApp;
  }
  return cachedApp;
}

export default async function handler(req: any, res: any) {
  try {
    const app = await bootstrap();
    app(req, res);
  } catch (err) {
    console.error('[handler] bootstrap/dispatch error:', err);
    res
      .status(500)
      .json({
        error: 'Internal server error',
        message: (err as Error).message,
      });
  }
}
