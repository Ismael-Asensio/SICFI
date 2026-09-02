import { NotFoundError, type DomainError } from '../../../../shared/domain/domain-error';
import { ok, err, type Result } from '../../../../shared/domain/result';
import type { TransactionRepository } from '../../../ledger/domain/transaction.repository';
import type { RecurringExpense } from '../../domain/recurring-expense.entity';
import type { RecurringExpenseRepository } from '../../domain/recurring-expense.repository';

export interface DeleteRecurringExpenseCommand {
  householdId: string;
  recurringExpenseId: string;
}

export type DeleteRecurringExpenseResult =
  | { kind: 'deleted' }
  | { kind: 'deactivated'; expense: RecurringExpense };

/**
 * RN-20: un fijo con movimientos asociados nunca se borra físicamente — se
 * marca inactivo para conservar el histórico. Sin movimientos, sí se borra.
 */
export class DeleteRecurringExpenseUseCase {
  constructor(
    private readonly expenses: RecurringExpenseRepository,
    private readonly transactions: TransactionRepository
  ) {}

  async execute(
    command: DeleteRecurringExpenseCommand
  ): Promise<Result<DeleteRecurringExpenseResult, DomainError>> {
    const expense = await this.expenses.findById(command.householdId, command.recurringExpenseId);
    if (!expense) {
      return err(
        new NotFoundError('El gasto fijo no existe', { recurringExpenseId: command.recurringExpenseId })
      );
    }

    const hasMovements = await this.transactions.existsForRecurringExpense(
      command.householdId,
      command.recurringExpenseId
    );

    if (hasMovements) {
      const deactivated = expense.with({ isActive: false });
      await this.expenses.save(deactivated);
      return ok({ kind: 'deactivated', expense: deactivated });
    }

    await this.expenses.delete(command.householdId, command.recurringExpenseId);
    return ok({ kind: 'deleted' });
  }
}
