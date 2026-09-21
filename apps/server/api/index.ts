import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';

const expressApp = express();
let cachedApp: any;

async function bootstrap() {
  if (!cachedApp) {
    const app = await NestFactory.create(
      AppModule,
      new ExpressAdapter(expressApp),
    );

    // Explicit production CORS policy
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
  const app = await bootstrap();
  app(req, res);
}
