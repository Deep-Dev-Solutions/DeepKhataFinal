import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { getCorsOrigins } from './config/cors';
import * as dotenv from 'dotenv';
import { installDecimalJson } from './common/money';
import { mountAuth } from './auth/mount-auth';
import { configureTrustProxy } from './common/trust-proxy';

dotenv.config();
installDecimalJson();

let cachedApp: any;

async function bootstrapServer() {
  if (!cachedApp) {
    // Better Auth reads the raw body, so Nest's own body parser is replaced by
    // mountAuth(), which mounts /api/auth/* first and the JSON parsers after it.
    const app = await NestFactory.create(AppModule, { bodyParser: false });

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );

    app.enableCors({
      origin: getCorsOrigins(),
      credentials: true,
      exposedHeaders: ['X-Next-Cursor'],
    });

    configureTrustProxy(app);
    app.use(cookieParser());
    mountAuth(app);

    await app.init();
    cachedApp = app.getHttpAdapter().getInstance();
  }
  return cachedApp;
}

bootstrapServer().then((app) => {
  const port = process.env.PORT || 5000;
  app.listen(port, () => console.log(`Server is running on port ${port}`));
});
