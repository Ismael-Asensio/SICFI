import type { Currency } from '../../src/shared/domain/currency.vo';
import { Money } from '../../src/shared/domain/money.vo';
import type {
  SavingsFundTotals,
  TransactionFilter,
  TransactionRepository,
} from '../../src/contexts/ledger/domain/transaction.repository';
import type { Transaction } from '../../src/contexts/ledger/domain/transaction.entity';

export class InMemoryTransactionRepository implements TransactionRepository {
  private rows = new Map<string, Transaction>();

  /** Moneda de respaldo cuando un fondo aún no tiene ningún movimiento. */
  constructor(private readonly fallbackCurrency: Currency) {}

  findById(householdId: string, id: string): Promise<Transaction | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row && row.householdId === householdId ? row : null);
  }

  findMany(householdId: string, filter: TransactionFilter = {}): Promise<Transaction[]> {
    const rows = [...this.rows.values()].filter((row) => {
      if (row.householdId !== householdId) return false;
      if (filter.periodId && row.periodId !== filter.periodId) return false;
      if (filter.categoryId && row.categoryId !== filter.categoryId) return false;
      if (filter.type && row.type !== filter.type) return false;
      if (filter.status && row.status !== filter.status) return false;
      if (filter.savingsFundId && row.savingsFundId !== filter.savingsFundId) return false;
      if (filter.recurringExpenseId && row.recurringExpenseId !== filter.recurringExpenseId) return false;
      return true;
    });
    return Promise.resolve(rows);
  }

  save(transaction: Transaction): Promise<void> {
    this.rows.set(transaction.id, transaction);
    return Promise.resolve();
  }

  delete(householdId: string, id: string): Promise<void> {
    const row = this.rows.get(id);
    if (row && row.householdId === householdId) this.rows.delete(id);
    return Promise.resolve();
  }

  getSavingsFundTotals(householdId: string, savingsFundId: string): Promise<SavingsFundTotals> {
    const rows = [...this.rows.values()].filter(
      (row) => row.householdId === householdId && row.savingsFundId === savingsFundId
    );
    const currency = rows[0]?.amount.currency ?? this.fallbackCurrency;

    return Promise.resolve({
      contributions: Money.sum(
        rows.filter((row) => row.type === 'AHORRO').map((row) => row.amount),
        currency
      ),
      withdrawals: Money.sum(
        rows.filter((row) => row.type === 'RETIRO_AHORRO').map((row) => row.amount),
        currency
      ),
    });
  }

  existsForRecurringExpense(householdId: string, recurringExpenseId: string): Promise<boolean> {
    for (const row of this.rows.values()) {
      if (row.householdId === householdId && row.recurringExpenseId === recurringExpenseId) {
        return Promise.resolve(true);
      }
    }
    return Promise.resolve(false);
  }
}
