import { NotFoundError, type DomainError } from '../../../../shared/domain/domain-error';
import type { Money } from '../../../../shared/domain/money.vo';
import type { Percentage } from '../../../../shared/domain/percentage.vo';
import { err, ok, type Result } from '../../../../shared/domain/result';
import type { TransactionRepository } from '../../../ledger/domain/transaction.repository';
import { SavingsFundBalanceCalculator } from '../../domain/savings-fund-balance-calculator.service';
import type { SavingsFundRepository } from '../../domain/savings-fund.repository';

export interface GetSavingsFundBalanceQuery {
  householdId: string;
  savingsFundId: string;
}

export interface SavingsFundBalanceView {
  balance: Money;
  progress: Percentage | null;
  remainingToTarget: Money | null;
}

/**
 * Único punto donde `catalog` (dueño del fondo) y `ledger` (dueño de los
 * movimientos) se cruzan para responder "¿cuánto hay ahorrado?" — el mismo
 * cálculo que RN-41 exige antes de aceptar un retiro.
 */
export class GetSavingsFundBalanceUseCase {
  constructor(
    private readonly funds: SavingsFundRepository,
    private readonly transactions: TransactionRepository
  ) {}

  async execute(query: GetSavingsFundBalanceQuery): Promise<Result<SavingsFundBalanceView, DomainError>> {
    const fund = await this.funds.findById(query.householdId, query.savingsFundId);
    if (!fund) {
      return err(
        new NotFoundError('El fondo de ahorro no existe', { savingsFundId: query.savingsFundId })
      );
    }

    const totals = await this.transactions.getSavingsFundTotals(query.householdId, fund.id);
    const balance = SavingsFundBalanceCalculator.balance(totals);

    return ok({
      balance,
      progress: fund.progressToward(balance),
      remainingToTarget: fund.remainingToTarget(balance),
    });
  }
}
