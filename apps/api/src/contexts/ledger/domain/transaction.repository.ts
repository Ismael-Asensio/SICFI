import type { Money } from '../../../shared/domain/money.vo';

import type { MovementType, TxStatus } from './movement-type';
import type { Transaction } from './transaction.entity';

export const TRANSACTION_REPOSITORY = Symbol('TRANSACTION_REPOSITORY');

export interface TransactionFilter {
  periodId?: string;
  categoryId?: string;
  type?: MovementType;
  status?: TxStatus;
  savingsFundId?: string;
  recurringExpenseId?: string;
}

/** Aportes y retiros de un fondo, en la moneda del fondo. Alimenta `SavingsFundBalanceCalculator`. */
export interface SavingsFundTotals {
  contributions: Money;
  withdrawals: Money;
}

export interface TransactionRepository {
  findById(householdId: string, id: string): Promise<Transaction | null>;
  findMany(householdId: string, filter?: TransactionFilter): Promise<Transaction[]>;
  save(transaction: Transaction): Promise<void>;
  delete(householdId: string, id: string): Promise<void>;

  /**
   * Suma de AHORRO y RETIRO_AHORRO de un fondo, en moneda base.
   *
   * No es un reporte: es la comprobación de escritura que exige RN-41 antes de
   * aceptar un retiro. El agregado real para el Panel es trabajo de `analytics`
   * (Fase 8).
   */
  getSavingsFundTotals(householdId: string, savingsFundId: string): Promise<SavingsFundTotals>;

  /** RN-20: si hay algún movimiento asociado, el fijo se desactiva en vez de borrarse. */
  existsForRecurringExpense(householdId: string, recurringExpenseId: string): Promise<boolean>;
}
