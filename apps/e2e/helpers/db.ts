import { PrismaClient } from '@prisma/client';
import { getE2eDatabaseUrl } from '../env';

export const db: PrismaClient = new PrismaClient({
  datasources: { db: { url: getE2eDatabaseUrl() } },
});
