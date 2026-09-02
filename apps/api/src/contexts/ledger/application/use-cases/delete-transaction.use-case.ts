import { NotFoundError, type DomainError } from '../../../../shared/domain/domain-error';
import { err, ok, type Result } from '../../../../shared/domain/result';
import type { TransactionRepository } from '../../domain/transaction.repository';

export interface DeleteTransactionCommand {
  householdId: string;
  transactionId: string;
}

/**
 * A diferencia de un fijo (RN-20), un movimiento no tiene borrado lógico: no
 * hay nada que dependa de él por FK, así que el borrado es siempre físico.
 * Quién puede borrar cuál lo decide `HouseholdPolicy.canModifyTransaction` en
 * la capa HTTP (Fase 7), no este caso de uso.
 */
export class DeleteTransactionUseCase {
  constructor(private readonly transactions: TransactionRepository) {}

  async execute(command: DeleteTransactionCommand): Promise<Result<void, DomainError>> {
    const transaction = await this.transactions.findById(command.householdId, command.transactionId);
    if (!transaction) {
      return err(new NotFoundError('El movimiento no existe', { transactionId: command.transactionId }));
    }

    await this.transactions.delete(command.householdId, command.transactionId);
    return ok();
  }
}
