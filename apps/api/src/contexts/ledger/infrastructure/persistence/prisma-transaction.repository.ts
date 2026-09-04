import { Injectable } from '@nestjs/common';

import { Currency } from '../../../../shared/domain/currency.vo';
import { PrismaRepositoryBase } from '../../../../shared/infrastructure/prisma/prisma-repository.base';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { Money } from '../../../../shared/domain/money.vo';
import type {
  SavingsFundTotals,
  TransactionFilter,
  TransactionRepository,
} from '../../domain/transaction.repository';
import type { Transaction } from '../../domain/transaction.entity';

import { TransactionPrismaMapper } from './transaction.prisma-mapper';

@Injectable()
export class PrismaTransactionRepository extends PrismaRepositoryBase implements TransactionRepository {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async findById(householdId: string, id: string): Promise<Transaction | null> {
    const row = await this.client.transaction.findFirst({
      where: { id, householdId },
      include: { household: true },
    });
    if (!row) return null;

    return TransactionPrismaMapper.toDomain(row, Currency.unsafe(row.household.baseCurrency));
  }

  async findMany(householdId: string, filter: TransactionFilter = {}): Promise<Transaction[]> {
    const rows = await this.client.transaction.findMany({
      where: {
        householdId,
        periodId: filter.periodId,
        categoryId: filter.categoryId,
        type: filter.type,
        status: filter.status,
        savingsFundId: filter.savingsFundId,
        recurringExpenseId: filter.recurringExpenseId,
      },
      include: { household: true },
      orderBy: { date: 'desc' },
    });

    return rows.map((row) => TransactionPrismaMapper.toDomain(row, Currency.unsafe(row.household.baseCurrency)));
  }

  async save(transaction: Transaction): Promise<void> {
    const data = TransactionPrismaMapper.toPersistence(transaction);
    await this.client.transaction.upsert({
      where: { id: transaction.id },
      create: data,
      update: {
        date: data.date,
        periodId: data.periodId,
        type: data.type,
        categoryId: data.categoryId,
        concept: data.concept,
        recurringExpenseId: data.recurringExpenseId,
        savingsFundId: data.savingsFundId,
        amount: data.amount,
        currency: data.currency,
        exchangeRate: data.exchangeRate,
        baseAmount: data.baseAmount,
        paymentMethodId: data.paymentMethodId,
        status: data.status,
        notes: data.notes,
        // createdByUserId nunca se actualiza: es inmutable (RN-45).
      },
    });
  }

  async delete(householdId: string, id: string): Promise<void> {
    await this.client.transaction.deleteMany({ where: { id, householdId } });
  }

  async getSavingsFundTotals(householdId: string, savingsFundId: string): Promise<SavingsFundTotals> {
    const fund = await this.client.savingsFund.findFirst({
      where: { id: savingsFundId, householdId },
      select: { currency: true },
    });
    // El caso de uso ya comprobó que el fondo existe; si no hay filas, cualquier
    // moneda vale porque el resultado será cero de todos modos.
    const currency = Currency.unsafe(fund?.currency ?? 'NIO');

    const sums = await this.client.transaction.groupBy({
      by: ['type'],
      where: { householdId, savingsFundId, type: { in: ['AHORRO', 'RETIRO_AHORRO'] } },
      _sum: { amount: true },
    });

    const sumFor = (type: 'AHORRO' | 'RETIRO_AHORRO'): Money => {
      const total = sums.find((row) => row.type === type)?._sum.amount;
      return total ? Money.unsafe(total.toString(), currency) : Money.zero(currency);
    };

    return { contributions: sumFor('AHORRO'), withdrawals: sumFor('RETIRO_AHORRO') };
  }

  async existsForRecurringExpense(householdId: string, recurringExpenseId: string): Promise<boolean> {
    const row = await this.client.transaction.findFirst({
      where: { householdId, recurringExpenseId },
      select: { id: true },
    });
    return row !== null;
  }
}
