import { NotFoundError, ValidationError, type DomainError } from '../../../../shared/domain/domain-error';
import type { Money } from '../../../../shared/domain/money.vo';
import type { Percentage } from '../../../../shared/domain/percentage.vo';
import { err, ok, type Result } from '../../../../shared/domain/result';
import type { BudgetSettings } from '../../domain/budget-settings.entity';
import type { BudgetSettingsRepository } from '../../domain/budget-settings.repository';

export interface UpdateBudgetSettingsCommand {
  householdId: string;
  year: number;
  name?: string;
  /** null explícito para volver a la resolución automática por fecha (RN-04). */
  activePeriodOverride?: number | null;
  spendThreshold?: Percentage;
  dueSoonDays?: number;
  inactivityDays?: number;
  savingGoalPerPeriod?: Money;
  paidToleranceAmount?: Money;
  disabledAlerts?: readonly string[];
}

export class UpdateBudgetSettingsUseCase {
  constructor(private readonly settingsRepo: BudgetSettingsRepository) {}

  async execute(command: UpdateBudgetSettingsCommand): Promise<Result<BudgetSettings, DomainError>> {
    const settings = await this.settingsRepo.findByYear(command.householdId, command.year);
    if (!settings) {
      return err(new NotFoundError('No hay configuración de presupuesto para ese año', { year: command.year }));
    }

    if (
      command.activePeriodOverride !== undefined &&
      command.activePeriodOverride !== null &&
      (command.activePeriodOverride < 1 || command.activePeriodOverride > 24)
    ) {
      return err(new ValidationError('El número de quincena debe estar entre 1 y 24'));
    }

    const updated = settings.with({
      name: command.name?.trim() || settings.name,
      activePeriodOverride:
        command.activePeriodOverride === undefined
          ? settings.activePeriodOverride
          : command.activePeriodOverride,
      spendThreshold: command.spendThreshold ?? settings.spendThreshold,
      dueSoonDays: command.dueSoonDays ?? settings.dueSoonDays,
      inactivityDays: command.inactivityDays ?? settings.inactivityDays,
      savingGoalPerPeriod: command.savingGoalPerPeriod ?? settings.savingGoalPerPeriod,
      paidToleranceAmount: command.paidToleranceAmount ?? settings.paidToleranceAmount,
      disabledAlerts: command.disabledAlerts ?? settings.disabledAlerts,
    });

    await this.settingsRepo.save(updated);
    return ok(updated);
  }
}
