import type { CalendarDate } from '../../../../shared/domain/calendar-date.vo';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  type DomainError,
} from '../../../../shared/domain/domain-error';
import type { Money } from '../../../../shared/domain/money.vo';
import { err, ok, type Result } from '../../../../shared/domain/result';
import { DueDay } from '../../domain/due-day.vo';
import type { Frequency, RecurringExpense } from '../../domain/recurring-expense.entity';
import type { RecurringExpenseRepository } from '../../domain/recurring-expense.repository';

export interface UpdateRecurringExpenseCommand {
  householdId: string;
  recurringExpenseId: string;
  categoryId?: string;
  concept?: string;
  amount?: Money;
  dueDay?: number;
  frequency?: Frequency;
  paymentMethodId?: string | null;
  startDate?: CalendarDate | null;
  endDate?: CalendarDate | null;
}

export class UpdateRecurringExpenseUseCase {
  constructor(private readonly expenses: RecurringExpenseRepository) {}

  async execute(command: UpdateRecurringExpenseCommand): Promise<Result<RecurringExpense, DomainError>> {
    const expense = await this.expenses.findById(command.householdId, command.recurringExpenseId);
    if (!expense) {
      return err(
        new NotFoundError('El gasto fijo no existe', { recurringExpenseId: command.recurringExpenseId })
      );
    }

    let concept = expense.concept;
    if (command.concept !== undefined) {
      concept = command.concept.trim();
      if (!concept) return err(new ValidationError('El concepto no puede estar vacío'));
      if (concept !== expense.concept) {
        const clash = await this.expenses.findByConcept(command.householdId, concept);
        if (clash) {
          return err(new ConflictError(`Ya existe un gasto fijo con el concepto "${concept}"`, { concept }));
        }
      }
    }

    let dueDay = expense.dueDay;
    if (command.dueDay !== undefined) {
      const parsed = DueDay.of(command.dueDay);
      if (!parsed.ok) return parsed;
      dueDay = parsed.value;
    }

    const updated = expense.with({
      categoryId: command.categoryId ?? expense.categoryId,
      concept,
      amount: command.amount ?? expense.amount,
      dueDay,
      frequency: command.frequency ?? expense.frequency,
      paymentMethodId: command.paymentMethodId === undefined ? expense.paymentMethodId : command.paymentMethodId,
      startDate: command.startDate === undefined ? expense.startDate : command.startDate,
      endDate: command.endDate === undefined ? expense.endDate : command.endDate,
    });

    await this.expenses.save(updated);
    return ok(updated);
  }
}
