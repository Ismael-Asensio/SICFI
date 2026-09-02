import type { MovementType, TxStatus } from '../../domain/movement-type';
import type { Transaction } from '../../domain/transaction.entity';
import type { TransactionRepository } from '../../domain/transaction.repository';

export interface ListTransactionsQuery {
  householdId: string;
  periodId?: string;
  categoryId?: string;
  type?: MovementType;
  status?: TxStatus;
  savingsFundId?: string;
  recurringExpenseId?: string;
}

export class ListTransactionsUseCase {
  constructor(private readonly transactions: TransactionRepository) {}

  async execute(query: ListTransactionsQuery): Promise<Transaction[]> {
    const { householdId, ...filter } = query;
    const transactions = await this.transactions.findMany(householdId, filter);
    return [...transactions].sort((a, b) => b.date.compare(a.date));
  }
}
