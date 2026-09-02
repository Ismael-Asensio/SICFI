import type { CalendarDate } from '../../../../shared/domain/calendar-date.vo';
import { ConflictError, ValidationError, type DomainError } from '../../../../shared/domain/domain-error';
import type { IdGenerator } from '../../../../shared/domain/id-generator.port';
import type { Money } from '../../../../shared/domain/money.vo';
import { err, ok, type Result } from '../../../../shared/domain/result';
import { DueDay } from '../../domain/due-day.vo';
import { RecurringExpense, type Frequency } from '../../domain/recurring-expense.entity';
import type { RecurringExpenseRepository } from '../../domain/recurring-expense.repository';

export interface CreateRecurringExpenseCommand {
  householdId: string;
  categoryId: string;
  concept: string;
  amount: Money;
  dueDay: number;
  frequency: Frequency;
  paymentMethodId?: string | null;
  startDate?: CalendarDate | null;
  endDate?: CalendarDate | null;
}

/**
 * `code` (F01, F02…) se genera aquí, nunca lo manda el cliente: es el
 * identificador legible y ESTABLE que corrige P11 del Excel (ahí dependía del
 * número de fila; reordenar filas reasignaba los ids).
 */
export class CreateRecurringExpenseUseCase {
  constructor(
    private readonly expenses: RecurringExpenseRepository,
    private readonly ids: IdGenerator
  ) {}

  async execute(command: CreateRecurringExpenseCommand): Promise<Result<RecurringExpense, DomainError>> {
    const concept = command.concept.trim();
    if (!concept) {
      return err(new ValidationError('Falta el concepto del gasto fijo'));
    }

    const dueDay = DueDay.of(command.dueDay);
    if (!dueDay.ok) return dueDay;

    const conceptClash = await this.expenses.findByConcept(command.householdId, concept);
    if (conceptClash) {
      return err(new ConflictError(`Ya existe un gasto fijo con el concepto "${concept}"`, { concept }));
    }

    const code = await this.nextCode(command.householdId);

    const expense = new RecurringExpense({
      id: this.ids.generate(),
      householdId: command.householdId,
      code,
      categoryId: command.categoryId,
      concept,
      amount: command.amount,
      dueDay: dueDay.value,
      frequency: command.frequency,
      paymentMethodId: command.paymentMethodId ?? null,
      isActive: true,
      notes: null,
      startDate: command.startDate ?? null,
      endDate: command.endDate ?? null,
    });

    await this.expenses.save(expense);
    return ok(expense);
  }

  /** Siguiente número libre a partir del mayor `code` existente, activo o no. */
  private async nextCode(householdId: string): Promise<string> {
    const existing = await this.expenses.findMany(householdId);
    const maxNumber = existing.reduce((max, expense) => {
      const match = /^F(\d+)$/.exec(expense.code);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return `F${String(maxNumber + 1).padStart(2, '0')}`;
  }
}
