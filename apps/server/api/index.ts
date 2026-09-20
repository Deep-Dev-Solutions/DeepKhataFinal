import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import { AppModule } from '../src/app.module';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import * as dotenv from 'dotenv';

dotenv.config();

const server = express();

// Global CORS preflight handler to guarantee OPTIONS always passes on Vercel
server.use((req, res, next) => {
  const origin = req.headers.origin as string;
  const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://deepkhata.vercel.app',
    'https://agency-admin-deepkhata.vercel.app',
  ];

  if (
    origin &&
    (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app'))
  ) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Accept, Authorization, Cookie',
    );
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// Health check and root route
server.get(['/', '/health'], (req, res) => {
  res.json({
    status: 'ok',
    service: 'DeepKhata Backend',
    timestamp: new Date().toISOString(),
  });
});

let isInitialized = false;

async function bootstrap() {
  if (!isInitialized) {
    const app = await NestFactory.create(AppModule, new ExpressAdapter(server));

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );

    app.use(cookieParser());

    await app.init();
    isInitialized = true;
  }
}

export default async function handler(req: any, res: any) {
  try {
    await bootstrap();
    server(req, res);
  } catch (err: any) {
    console.error('Vercel serverless error:', err);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Accept, Authorization, Cookie',
    );
    res.status(500).json({
      error: 'SERVERLESS_BOOTSTRAP_FAILED',
      message: err?.message || String(err),
      stack: err?.stack,
    });
  }
}
