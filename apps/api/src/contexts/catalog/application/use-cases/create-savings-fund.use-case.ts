import type { CalendarDate } from '../../../../shared/domain/calendar-date.vo';
import type { Currency } from '../../../../shared/domain/currency.vo';
import { ConflictError, ValidationError, type DomainError } from '../../../../shared/domain/domain-error';
import type { IdGenerator } from '../../../../shared/domain/id-generator.port';
import type { Money } from '../../../../shared/domain/money.vo';
import { err, ok, type Result } from '../../../../shared/domain/result';
import { SavingsFund } from '../../domain/savings-fund.entity';
import type { SavingsFundRepository } from '../../domain/savings-fund.repository';

export interface CreateSavingsFundCommand {
  householdId: string;
  name: string;
  currency: Currency;
  targetAmount?: Money | null;
  targetDate?: CalendarDate | null;
}

export class CreateSavingsFundUseCase {
  constructor(
    private readonly funds: SavingsFundRepository,
    private readonly ids: IdGenerator
  ) {}

  async execute(command: CreateSavingsFundCommand): Promise<Result<SavingsFund, DomainError>> {
    const name = command.name.trim();
    if (!name) {
      return err(new ValidationError('El nombre del fondo no puede estar vacío'));
    }
    if (command.targetAmount && !command.targetAmount.isPositive()) {
      return err(new ValidationError('La meta del fondo debe ser mayor que cero'));
    }

    const existing = await this.funds.findByName(command.householdId, name);
    if (existing) {
      return err(new ConflictError(`Ya existe un fondo llamado "${name}"`, { name }));
    }

    const fund = new SavingsFund({
      id: this.ids.generate(),
      householdId: command.householdId,
      name,
      currency: command.currency,
      targetAmount: command.targetAmount ?? null,
      targetDate: command.targetDate ?? null,
      // Solo el primer fondo del onboarding es el por defecto (BootstrapUserUseCase).
      isDefault: false,
      isActive: true,
    });

    await this.funds.save(fund);
    return ok(fund);
  }
}
