import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from '../../src/app.module.js';
import { installDecimalJson } from '../../src/common/money';
import { mountAuth } from '../../src/auth/mount-auth';

installDecimalJson();

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication({ bodyParser: false });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.use(cookieParser());
  mountAuth(app);
  await app.init();
  return app;
}

export async function closeTestApp(app: INestApplication | undefined): Promise<void> {
  if (app) await app.close();
}
