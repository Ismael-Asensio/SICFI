import { BusinessRuleError, NotFoundError, type DomainError } from '../../../../shared/domain/domain-error';
import { err, ok, type Result } from '../../../../shared/domain/result';
import type { SavingsFund } from '../../domain/savings-fund.entity';
import type { SavingsFundRepository } from '../../domain/savings-fund.repository';

export interface SetSavingsFundActiveCommand {
  householdId: string;
  savingsFundId: string;
  isActive: boolean;
}

export class SetSavingsFundActiveUseCase {
  constructor(private readonly funds: SavingsFundRepository) {}

  async execute(command: SetSavingsFundActiveCommand): Promise<Result<SavingsFund, DomainError>> {
    const fund = await this.funds.findById(command.householdId, command.savingsFundId);
    if (!fund) {
      return err(
        new NotFoundError('El fondo de ahorro no existe', { savingsFundId: command.savingsFundId })
      );
    }

    // RN-39: cada household necesita al menos un fondo utilizable para poder
    // registrar un AHORRO. Desactivar el único fondo por defecto dejaría a un
    // household nuevo sin dónde apartar dinero.
    if (fund.isDefault && !command.isActive) {
      return err(
        new BusinessRuleError(
          'RN-39',
          `No puedes desactivar "${fund.name}": es el fondo por defecto del household`,
          { savingsFundId: command.savingsFundId }
        )
      );
    }

    const updated = fund.with({ isActive: command.isActive });
    await this.funds.save(updated);
    return ok(updated);
  }
}
