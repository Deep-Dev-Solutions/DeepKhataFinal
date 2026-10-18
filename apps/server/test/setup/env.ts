import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as dotenv from 'dotenv';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

dotenv.config({ path: path.join(serverRoot, '.env') });

if (!process.env.DATABASE_URL_TEST) {
  throw new Error('DATABASE_URL_TEST must be set in apps/server/.env');
}

process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.DIRECT_URL = process.env.DATABASE_URL_TEST;
process.env.NODE_ENV = 'test';
