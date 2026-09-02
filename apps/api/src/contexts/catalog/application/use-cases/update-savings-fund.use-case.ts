import type { CalendarDate } from '../../../../shared/domain/calendar-date.vo';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
  type DomainError,
} from '../../../../shared/domain/domain-error';
import type { Money } from '../../../../shared/domain/money.vo';
import { err, ok, type Result } from '../../../../shared/domain/result';
import type { SavingsFund } from '../../domain/savings-fund.entity';
import type { SavingsFundRepository } from '../../domain/savings-fund.repository';

export interface UpdateSavingsFundCommand {
  householdId: string;
  savingsFundId: string;
  name?: string;
  targetAmount?: Money | null;
  targetDate?: CalendarDate | null;
}

export class UpdateSavingsFundUseCase {
  constructor(private readonly funds: SavingsFundRepository) {}

  async execute(command: UpdateSavingsFundCommand): Promise<Result<SavingsFund, DomainError>> {
    const fund = await this.funds.findById(command.householdId, command.savingsFundId);
    if (!fund) {
      return err(new NotFoundError('El fondo de ahorro no existe', { savingsFundId: command.savingsFundId }));
    }

    let name = fund.name;
    if (command.name !== undefined) {
      name = command.name.trim();
      if (!name) return err(new ValidationError('El nombre del fondo no puede estar vacío'));
      if (name !== fund.name) {
        const clash = await this.funds.findByName(command.householdId, name);
        if (clash) return err(new ConflictError(`Ya existe un fondo llamado "${name}"`, { name }));
      }
    }

    if (command.targetAmount && !command.targetAmount.isPositive()) {
      return err(new ValidationError('La meta del fondo debe ser mayor que cero'));
    }

    const updated = fund.with({
      name,
      targetAmount: command.targetAmount === undefined ? fund.targetAmount : command.targetAmount,
      targetDate: command.targetDate === undefined ? fund.targetDate : command.targetDate,
    });

    await this.funds.save(updated);
    return ok(updated);
  }
}
