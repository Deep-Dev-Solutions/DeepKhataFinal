import { Test, TestingModule } from '@nestjs/testing';
import { LedgerService } from './ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('LedgerService (Double-Entry Invariant & Rollback Tests)', () => {
  let service: LedgerService;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LedgerService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: vi.fn(),
            transaction: {
              create: vi.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<LedgerService>(LedgerService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('Double-Entry Invariant: strictly rejects unbalanced single debit without credit and rolls back', async () => {
    const transactionSpy = vi.spyOn(prismaService, '$transaction');

    const unbalancedDto = {
      businessId: 'biz-hafeez-01',
      type: 'SALE',
      description: 'Unbalanced Debit Only Transaction',
      postings: [
        { accountId: 'CASH', accountType: 'ASSET', amount: 5000 }, // No corresponding credit
      ],
    };

    await expect(
      service.createBalancedTransaction(unbalancedDto as any),
    ).rejects.toThrow(BadRequestException);

    // Assert that the database transaction was NEVER triggered (Rollback guarantee)
    expect(transactionSpy).not.toHaveBeenCalled();
  });

  it('Double-Entry Invariant: rejects unbalanced multi-line transactions with non-zero sum', async () => {
    const transactionSpy = vi.spyOn(prismaService, '$transaction');

    const unbalancedDto = {
      businessId: 'biz-hafeez-01',
      type: 'SALE',
      description: 'Split sale with calculation mismatch',
      postings: [
        { accountId: 'CASH', accountType: 'ASSET', amount: 3000 },
        { accountId: 'CUST-01', accountType: 'CUSTOMER_AR', amount: 4500 },
        { accountId: 'REVENUE', accountType: 'REVENUE', amount: -7000 }, // Sums to +500 (unbalanced)
      ],
    };

    await expect(
      service.createBalancedTransaction(unbalancedDto as any),
    ).rejects.toThrow(BadRequestException);

    expect(transactionSpy).not.toHaveBeenCalled();
  });

  it('Double-Entry Invariant: successfully commits balanced multi-leg transaction (Debits + Credits = 0)', async () => {
    const balancedDto = {
      businessId: 'biz-hafeez-01',
      type: 'SALE',
      referenceId: 'ORD-1001',
      description: 'Fully balanced split payment sale',
      postings: [
        { accountId: 'CASH', accountType: 'ASSET', amount: 4000 },
        { accountId: 'CUST-01', accountType: 'CUSTOMER_AR', amount: 6000 },
        { accountId: 'REVENUE', accountType: 'REVENUE', amount: -10000 }, // 4000 + 6000 - 10000 === 0
      ],
    };

    const mockCreatedTx = {
      id: 'tx-uuid-999',
      ...balancedDto,
      createdAt: new Date(),
    };

    vi.spyOn(prismaService, '$transaction').mockImplementation(
      async (callback: any) => {
        return callback({
          transaction: {
            create: vi.fn().mockResolvedValue(mockCreatedTx),
          },
        });
      },
    );

    const result = await service.createBalancedTransaction(balancedDto as any);

    expect(result).toBeDefined();
    expect(prismaService.$transaction).toHaveBeenCalledTimes(1);
  });
});
