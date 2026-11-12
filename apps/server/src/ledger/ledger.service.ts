import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { round2, sum, isZero, neg } from '../common/money';

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

  /**
   * Voids a transaction by marking it and posting a mirror transaction inside
   * one database transaction. Postings are never updated or deleted.
   */
  async reverse(
    businessId: string,
    transactionId: string,
    userId: string,
    reason: string,
    tx?: Prisma.TransactionClient,
  ) {
    const run = async (client: Prisma.TransactionClient) => {
      const original = await client.transaction.findFirst({
        where: { id: transactionId, businessId },
        include: { postings: true },
      });

      if (!original) {
        throw new NotFoundException('Transaction not found.');
      }
      if (original.voidedAt) {
        throw new ConflictException('This transaction is already voided.');
      }
      if (original.reversesId) {
        throw new ConflictException(
          'A reversing transaction cannot itself be voided.',
        );
      }

      let reversal;
      try {
        reversal = await client.transaction.create({
          data: {
            businessId,
            referenceId: original.referenceId,
            type: `${original.type}_REVERSAL`,
            description: `Void: ${reason}`,
            reversesId: original.id,
            postings: {
              create: original.postings.map((posting) => ({
                accountId: posting.accountId,
                accountType: posting.accountType,
                amount: neg(posting.amount),
              })),
            },
          },
          include: { postings: true },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          throw new ConflictException('This transaction is already voided.');
        }
        throw err;
      }

      await client.transaction.update({
        where: { id: original.id },
        data: {
          voidedAt: new Date(),
          voidedById: userId,
          voidReason: reason,
        },
      });

      return reversal;
    };

    if (tx) return run(tx);
    return this.prisma.$transaction(run);
  }
}
