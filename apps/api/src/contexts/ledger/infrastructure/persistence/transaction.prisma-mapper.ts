import type { Transaction as PrismaTransaction } from '@prisma/client';
import Decimal from 'decimal.js';

import { CalendarDate } from '../../../../shared/domain/calendar-date.vo';
import { Currency } from '../../../../shared/domain/currency.vo';
import { Money } from '../../../../shared/domain/money.vo';
import type { MovementType, TxStatus } from '../../domain/movement-type';
import { Transaction } from '../../domain/transaction.entity';

/**
 * `baseAmount` no lleva su propia columna de moneda: es siempre la
 * `baseCurrency` del household en el momento de leer, igual que
 * `BudgetSettings`. Se recibe aparte porque `Transaction` no conoce su
 * `Household`.
 */
export const TransactionPrismaMapper = {
  toDomain(row: PrismaTransaction, baseCurrency: Currency): Transaction {
    const currency = Currency.unsafe(row.currency);
    return Transaction.reconstitute({
      id: row.id,
      householdId: row.householdId,
      date: CalendarDate.fromDbDate(row.date),
      periodId: row.periodId,
      type: row.type as MovementType,
      categoryId: row.categoryId,
      concept: row.concept,
      recurringExpenseId: row.recurringExpenseId,
      savingsFundId: row.savingsFundId,
      amount: Money.unsafe(row.amount.toString(), currency),
      // Nunca vía Money: redondearía la tasa a 2 decimales y perdería la
      // precisión de Decimal(18,8) que RN-37 necesita.
      exchangeRate: new Decimal(row.exchangeRate.toString()),
      baseAmount: Money.unsafe(row.baseAmount.toString(), baseCurrency),
      paymentMethodId: row.paymentMethodId,
      status: row.status as TxStatus,
      notes: row.notes,
      createdByUserId: row.createdByUserId,
    });
  },

  toPersistence(transaction: Transaction): {
    id: string;
    householdId: string;
    date: Date;
    periodId: string;
    type: MovementType;
    categoryId: string;
    concept: string;
    recurringExpenseId: string | null;
    savingsFundId: string | null;
    amount: string;
    currency: string;
    exchangeRate: string;
    baseAmount: string;
    paymentMethodId: string | null;
    status: TxStatus;
    notes: string | null;
    createdByUserId: string;
  } {
    return {
      id: transaction.id,
      householdId: transaction.householdId,
      date: transaction.date.toUtcDate(),
      periodId: transaction.periodId,
      type: transaction.type,
      categoryId: transaction.categoryId,
      concept: transaction.concept,
      recurringExpenseId: transaction.recurringExpenseId,
      savingsFundId: transaction.savingsFundId,
      amount: transaction.amount.toFixed(),
      currency: transaction.amount.currency.code,
      exchangeRate: transaction.exchangeRate.toString(),
      baseAmount: transaction.baseAmount.toFixed(),
      paymentMethodId: transaction.paymentMethodId,
      status: transaction.status,
      notes: transaction.notes,
      createdByUserId: transaction.createdByUserId,
    };
  },
};
