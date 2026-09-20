import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    try {
      await this.$connect();
    } catch (err) {
      console.warn(
        'Prisma initial connection failed, will retry lazily on query:',
        err,
      );
    }
  }
}
