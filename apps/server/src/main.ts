import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import * as dotenv from 'dotenv';

dotenv.config();

let cachedApp: any;

async function bootstrapServer() {
  if (!cachedApp) {
    const app = await NestFactory.create(AppModule);

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );

    const explicitOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://deepkhata.vercel.app',
      'https://agency-admin-deepkhata.vercel.app',
    ];

    const envOrigins = process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((o) => {
          let trimmed = o.trim();
          if (trimmed.endsWith('/')) {
            trimmed = trimmed.slice(0, -1);
          }
          return trimmed;
        }).filter(Boolean)
      : [];

    const allowedOrigins = Array.from(
      new Set([...explicitOrigins, ...envOrigins]),
    );

    app.enableCors({
      origin: allowedOrigins,
      credentials: true,
    });

    app.use(cookieParser());

    await app.init();
    cachedApp = app.getHttpAdapter().getInstance();
  }
  return cachedApp;
}

// Vercel Serverless Function Handler
export default async function handler(req: any, res: any) {
  const app = await bootstrapServer();
  return app(req, res);
}

// Local Development Server
if (!process.env.VERCEL) {
  bootstrapServer().then((app) => {
    const port = process.env.PORT || 5000;
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  });
}
