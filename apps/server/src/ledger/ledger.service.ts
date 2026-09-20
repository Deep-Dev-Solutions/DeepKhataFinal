import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';

@Injectable()
export class LedgerService {
  constructor(private prisma: PrismaService) {}

  async createBalancedTransaction(dto: CreateTransactionDto) {
    // Explicitly validate that postings sum to exactly zero
    const totalAmount = dto.postings.reduce(
      (sum, posting) => sum + posting.amount,
      0,
    );

    if (Math.abs(totalAmount) > 0.001) {
      throw new BadRequestException(
        'Transaction postings must balance to zero (debits + credits = 0).',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          businessId: dto.businessId,
          referenceId: dto.referenceId,
          type: dto.type,
          description: dto.description,
          postings: {
            create: dto.postings.map((p) => ({
              accountId: p.accountId,
              accountType: p.accountType,
              amount: p.amount,
            })),
          },
        },
        include: {
          postings: true,
        },
      });

      return transaction;
    });
  }
}
