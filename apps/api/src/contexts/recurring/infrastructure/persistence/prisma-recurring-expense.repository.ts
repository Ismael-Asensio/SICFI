import { Injectable } from '@nestjs/common';

import { PrismaRepositoryBase } from '../../../../shared/infrastructure/prisma/prisma-repository.base';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import type { RecurringExpense } from '../../domain/recurring-expense.entity';
import type { RecurringExpenseRepository } from '../../domain/recurring-expense.repository';

import { RecurringExpensePrismaMapper } from './recurring-expense.prisma-mapper';

@Injectable()
export class PrismaRecurringExpenseRepository
  extends PrismaRepositoryBase
  implements RecurringExpenseRepository
{
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async findById(householdId: string, id: string): Promise<RecurringExpense | null> {
    const row = await this.client.recurringExpense.findFirst({ where: { id, householdId } });
    return row ? RecurringExpensePrismaMapper.toDomain(row) : null;
  }

  async findByCode(householdId: string, code: string): Promise<RecurringExpense | null> {
    const row = await this.client.recurringExpense.findUnique({
      where: { householdId_code: { householdId, code } },
    });
    return row ? RecurringExpensePrismaMapper.toDomain(row) : null;
  }

  async findByConcept(householdId: string, concept: string): Promise<RecurringExpense | null> {
    const row = await this.client.recurringExpense.findUnique({
      where: { householdId_concept: { householdId, concept } },
    });
    return row ? RecurringExpensePrismaMapper.toDomain(row) : null;
  }

  async findMany(householdId: string, options?: { activeOnly?: boolean }): Promise<RecurringExpense[]> {
    const rows = await this.client.recurringExpense.findMany({
      where: { householdId, ...(options?.activeOnly ? { isActive: true } : {}) },
    });
    return rows.map(RecurringExpensePrismaMapper.toDomain);
  }

  async save(expense: RecurringExpense): Promise<void> {
    const data = RecurringExpensePrismaMapper.toPersistence(expense);
    await this.client.recurringExpense.upsert({
      where: { id: expense.id },
      create: data,
      update: {
        categoryId: data.categoryId,
        concept: data.concept,
        amount: data.amount,
        currency: data.currency,
        dueDay: data.dueDay,
        frequency: data.frequency,
        appliesTo: data.appliesTo,
        paymentMethodId: data.paymentMethodId,
        isActive: data.isActive,
        notes: data.notes,
        startDate: data.startDate,
        endDate: data.endDate,
      },
    });
  }

  async delete(householdId: string, id: string): Promise<void> {
    await this.client.recurringExpense.deleteMany({ where: { id, householdId } });
  }
}
