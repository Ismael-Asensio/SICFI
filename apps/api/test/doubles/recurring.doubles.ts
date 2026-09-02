import type { RecurringExpense } from '../../src/contexts/recurring/domain/recurring-expense.entity';
import type { RecurringExpenseRepository } from '../../src/contexts/recurring/domain/recurring-expense.repository';

export class InMemoryRecurringExpenseRepository implements RecurringExpenseRepository {
  private rows = new Map<string, RecurringExpense>();

  findById(householdId: string, id: string): Promise<RecurringExpense | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row && row.householdId === householdId ? row : null);
  }

  findByCode(householdId: string, code: string): Promise<RecurringExpense | null> {
    for (const row of this.rows.values()) {
      if (row.householdId === householdId && row.code === code) return Promise.resolve(row);
    }
    return Promise.resolve(null);
  }

  findByConcept(householdId: string, concept: string): Promise<RecurringExpense | null> {
    for (const row of this.rows.values()) {
      if (row.householdId === householdId && row.concept === concept) return Promise.resolve(row);
    }
    return Promise.resolve(null);
  }

  findMany(householdId: string, options?: { activeOnly?: boolean }): Promise<RecurringExpense[]> {
    const all = [...this.rows.values()].filter((row) => row.householdId === householdId);
    return Promise.resolve(options?.activeOnly ? all.filter((row) => row.isActive) : all);
  }

  save(expense: RecurringExpense): Promise<void> {
    this.rows.set(expense.id, expense);
    return Promise.resolve();
  }

  delete(householdId: string, id: string): Promise<void> {
    const row = this.rows.get(id);
    if (row && row.householdId === householdId) this.rows.delete(id);
    return Promise.resolve();
  }
}
