import type { CalendarDate } from '../../../../shared/domain/calendar-date.vo';
import type { Currency } from '../../../../shared/domain/currency.vo';
import { ConflictError, type DomainError } from '../../../../shared/domain/domain-error';
import type { IdGenerator } from '../../../../shared/domain/id-generator.port';
import { Money } from '../../../../shared/domain/money.vo';
import { Percentage } from '../../../../shared/domain/percentage.vo';
import { err, ok, type Result } from '../../../../shared/domain/result';
import { BudgetSettings } from '../../domain/budget-settings.entity';
import type { BudgetSettingsRepository } from '../../domain/budget-settings.repository';
import { PeriodFactory } from '../../domain/period-factory.service';
import type { PeriodRepository } from '../../domain/period.repository';
import { Period } from '../../domain/period.entity';

export interface CreateBudgetSettingsCommand {
  householdId: string;
  year: number;
  baseCurrency: Currency;
  name?: string;
  /** RN-35: nada con dependencia de fechas se evalúa antes de esta. */
  controlStartDate: CalendarDate;
  spendThreshold?: Percentage;
  dueSoonDays?: number;
  inactivityDays?: number;
  savingGoalPerPeriod?: Money;
  paidToleranceAmount?: Money;
}

export interface CreatedBudgetSettings {
  settings: BudgetSettings;
  periods: Period[];
}

/**
 * Crea la configuración del año y las 24 quincenas de una sola vez: sin
 * quincenas, la configuración no sirve para nada (RN-01, RN-02).
 */
export class CreateBudgetSettingsUseCase {
  constructor(
    private readonly settingsRepo: BudgetSettingsRepository,
    private readonly periodsRepo: PeriodRepository,
    private readonly ids: IdGenerator
  ) {}

  async execute(command: CreateBudgetSettingsCommand): Promise<Result<CreatedBudgetSettings, DomainError>> {
    const existing = await this.settingsRepo.findByYear(command.householdId, command.year);
    if (existing) {
      return err(
        new ConflictError(`Ya existe una configuración de presupuesto para ${command.year}`, {
          year: command.year,
        })
      );
    }

    const settings = new BudgetSettings({
      id: this.ids.generate(),
      householdId: command.householdId,
      year: command.year,
      name: command.name?.trim() || `Presupuesto ${command.year}`,
      activePeriodOverride: null,
      controlStartDate: command.controlStartDate,
      spendThreshold: command.spendThreshold ?? Percentage.unsafe('0.80'),
      dueSoonDays: command.dueSoonDays ?? 3,
      inactivityDays: command.inactivityDays ?? 5,
      savingGoalPerPeriod: command.savingGoalPerPeriod ?? Money.zero(command.baseCurrency),
      paidToleranceAmount: command.paidToleranceAmount ?? Money.unsafe('1', command.baseCurrency),
      disabledAlerts: [],
    });

    await this.settingsRepo.save(settings);

    const periods = PeriodFactory.buildYear(command.year).map(
      (blueprint) =>
        new Period({
          id: this.ids.generate(),
          householdId: command.householdId,
          year: command.year,
          number: blueprint.number,
          month: blueprint.month,
          half: blueprint.half,
          startDate: blueprint.startDate,
          endDate: blueprint.endDate,
          // RN corrige P12: sin ingreso por defecto. Que el usuario lo declare
          // quincena a quincena evita el falso "ya planifiqué todo el año".
          plannedIncome: null,
          plannedIncomeCurrency: command.baseCurrency,
        })
    );

    await this.periodsRepo.saveMany(periods);

    return ok({ settings, periods });
  }
}
