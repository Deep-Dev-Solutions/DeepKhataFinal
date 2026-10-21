import { Test } from '@nestjs/testing';
import { INestApplication, Type, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from '../../src/app.module.js';
import { installDecimalJson } from '../../src/common/money';
import { mountAuth } from '../../src/auth/mount-auth';
import { configureTrustProxy } from '../../src/common/trust-proxy';

installDecimalJson();

/** `controllers` adds test-only controllers (e.g. an IP echo) to the app. */
export async function createTestApp(
  extra: { controllers?: Type<unknown>[] } = {},
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers: extra.controllers ?? [],
  }).compile();

  const app = moduleRef.createNestApplication({ bodyParser: false });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  configureTrustProxy(app);
  app.use(cookieParser());
  mountAuth(app);
  await app.init();
  return app;
}

export async function closeTestApp(app: INestApplication | undefined): Promise<void> {
  if (app) await app.close();
}
