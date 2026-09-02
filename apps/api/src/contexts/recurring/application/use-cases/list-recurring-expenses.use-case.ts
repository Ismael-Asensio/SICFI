import type { RecurringExpense } from '../../domain/recurring-expense.entity';
import type { RecurringExpenseRepository } from '../../domain/recurring-expense.repository';

export interface ListRecurringExpensesQuery {
  householdId: string;
  activeOnly?: boolean;
}

export class ListRecurringExpensesUseCase {
  constructor(private readonly expenses: RecurringExpenseRepository) {}

  async execute(query: ListRecurringExpensesQuery): Promise<RecurringExpense[]> {
    const expenses = await this.expenses.findMany(query.householdId, { activeOnly: query.activeOnly });
    return [...expenses].sort((a, b) => a.code.localeCompare(b.code));
  }
}
