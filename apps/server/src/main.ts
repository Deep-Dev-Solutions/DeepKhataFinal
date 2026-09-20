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

    app.enableCors({
      origin: [
        'http://localhost:3000',
        'http://localhost:3001',
        'https://deepkhata.vercel.app',
        'https://agency-admin-deepkhata.vercel.app',
      ],
      credentials: true,
    });

    app.use(cookieParser());

    await app.init();
    cachedApp = app.getHttpAdapter().getInstance();
  }
  return cachedApp;
}

// Export for Vercel Serverless
export default async function handler(req: any, res: any) {
  const app = await bootstrapServer();
  return app(req, res);
}

// Local Development
if (!process.env.VERCEL) {
  bootstrapServer().then((app) => {
    const port = process.env.PORT || 5000;
    app.listen(port, () => console.log(`Server is running on port ${port}`));
  });
}
