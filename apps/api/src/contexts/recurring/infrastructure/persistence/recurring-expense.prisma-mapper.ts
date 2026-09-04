import type { RecurringExpense as PrismaRecurringExpense } from '@prisma/client';

import { CalendarDate } from '../../../../shared/domain/calendar-date.vo';
import { Currency } from '../../../../shared/domain/currency.vo';
import { Money } from '../../../../shared/domain/money.vo';
import { DueDay } from '../../domain/due-day.vo';
import { RecurringExpense, type AppliesTo, type Frequency } from '../../domain/recurring-expense.entity';

/**
 * `appliesTo` NO se lee de la fila: es un getter derivado en la entidad
 * (RN-18). La columna existe solo para que `analytics` pueda agregar en SQL
 * sin recorrer el dominio; se recalcula siempre al escribir.
 */
export const RecurringExpensePrismaMapper = {
  toDomain(row: PrismaRecurringExpense): RecurringExpense {
    const currency = Currency.unsafe(row.currency);
    return new RecurringExpense({
      id: row.id,
      householdId: row.householdId,
      code: row.code,
      categoryId: row.categoryId,
      concept: row.concept,
      amount: Money.unsafe(row.amount.toString(), currency),
      dueDay: DueDay.unsafe(row.dueDay),
      frequency: row.frequency as Frequency,
      paymentMethodId: row.paymentMethodId,
      isActive: row.isActive,
      notes: row.notes,
      startDate: row.startDate ? CalendarDate.fromDbDate(row.startDate) : null,
      endDate: row.endDate ? CalendarDate.fromDbDate(row.endDate) : null,
    });
  },

  toPersistence(expense: RecurringExpense): {
    id: string;
    householdId: string;
    code: string;
    categoryId: string;
    concept: string;
    amount: string;
    currency: string;
    dueDay: number;
    frequency: Frequency;
    appliesTo: AppliesTo;
    paymentMethodId: string | null;
    isActive: boolean;
    notes: string | null;
    startDate: Date | null;
    endDate: Date | null;
  } {
    return {
      id: expense.id,
      householdId: expense.householdId,
      code: expense.code,
      categoryId: expense.categoryId,
      concept: expense.concept,
      amount: expense.amount.toFixed(),
      currency: expense.amount.currency.code,
      dueDay: expense.dueDay.value,
      frequency: expense.frequency,
      appliesTo: expense.appliesTo,
      paymentMethodId: expense.paymentMethodId,
      isActive: expense.isActive,
      notes: expense.notes,
      startDate: expense.startDate ? expense.startDate.toUtcDate() : null,
      endDate: expense.endDate ? expense.endDate.toUtcDate() : null,
    };
  },
};
