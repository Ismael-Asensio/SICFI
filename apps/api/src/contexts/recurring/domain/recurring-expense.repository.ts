import type { RecurringExpense } from './recurring-expense.entity';

export const RECURRING_EXPENSE_REPOSITORY = Symbol('RECURRING_EXPENSE_REPOSITORY');

export interface RecurringExpenseRepository {
  findById(householdId: string, id: string): Promise<RecurringExpense | null>;
  /** Para la unicidad `@@unique([householdId, code])`. */
  findByCode(householdId: string, code: string): Promise<RecurringExpense | null>;
  /** Para la unicidad `@@unique([householdId, concept])`. */
  findByConcept(householdId: string, concept: string): Promise<RecurringExpense | null>;
  findMany(householdId: string, options?: { activeOnly?: boolean }): Promise<RecurringExpense[]>;
  save(expense: RecurringExpense): Promise<void>;
  delete(householdId: string, id: string): Promise<void>;
}
