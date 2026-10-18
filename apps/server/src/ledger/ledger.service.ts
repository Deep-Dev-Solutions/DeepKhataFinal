import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { round2, sum, isZero } from '../common/money';

@Injectable()
export class LedgerService {
  constructor(private prisma: PrismaService) {}

  /**
   * Creates a transaction with postings that must sum to exactly zero (2 dp).
   * If `tx` is given, writes with it (joining the caller's transaction);
   * otherwise wraps the write in its own $transaction.
   */
  async createBalancedTransaction(
    dto: CreateTransactionDto,
    tx?: Prisma.TransactionClient,
  ) {
    const postings = dto.postings.map((p) => ({
      accountId: p.accountId,
      accountType: p.accountType,
      amount: round2(p.amount),
    }));

    const total = sum(postings.map((p) => p.amount));
    if (!isZero(total)) {
      throw new BadRequestException(
        `Unbalanced transaction: postings sum to ${total.toFixed(2)}`,
      );
    }

    const write = (client: Prisma.TransactionClient) =>
      client.transaction.create({
        data: {
          businessId: dto.businessId,
          referenceId: dto.referenceId,
          type: dto.type,
          description: dto.description,
          dueDate: dto.dueDate,
          postings: { create: postings },
        },
        include: { postings: true },
      });

    if (tx) return write(tx);
    return this.prisma.$transaction((client) => write(client));
  }
}
