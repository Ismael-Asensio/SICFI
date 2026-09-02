import type { Clock } from '../../../../shared/domain/clock.port';
import { NotFoundError, type DomainError } from '../../../../shared/domain/domain-error';
import { err, ok, type Result } from '../../../../shared/domain/result';
import type { HouseholdRepository } from '../../../iam/domain/household.repository';
import type { BudgetSettingsRepository } from '../../domain/budget-settings.repository';
import type { Period } from '../../domain/period.entity';
import type { PeriodRepository } from '../../domain/period.repository';

export interface GetActivePeriodQuery {
  householdId: string;
  year: number;
}

/**
 * RN-04: la quincena activa es la que contiene *hoy* en la zona horaria del
 * household, salvo que `BudgetSettings.activePeriodOverride` fije una a mano.
 * Corrige P4 del Excel (`TODAY()` usaba la zona de la máquina, no la del
 * usuario).
 */
export class GetActivePeriodUseCase {
  constructor(
    private readonly households: HouseholdRepository,
    private readonly settingsRepo: BudgetSettingsRepository,
    private readonly periods: PeriodRepository,
    private readonly clock: Clock
  ) {}

  async execute(query: GetActivePeriodQuery): Promise<Result<Period, DomainError>> {
    const household = await this.households.findById(query.householdId);
    if (!household) {
      return err(new NotFoundError('El household no existe', { householdId: query.householdId }));
    }

    const settings = await this.settingsRepo.findByYear(query.householdId, query.year);
    if (!settings) {
      return err(
        new NotFoundError('No hay configuración de presupuesto para ese año', { year: query.year })
      );
    }

    const period = settings.activePeriodOverride
      ? await this.periods.findByNumber(query.householdId, query.year, settings.activePeriodOverride)
      : await this.periods.findByDate(query.householdId, this.clock.today(household.timezone));

    if (!period) {
      return err(
        new NotFoundError('No se pudo resolver la quincena activa', {
          year: query.year,
          activePeriodOverride: settings.activePeriodOverride,
        })
      );
    }

    return ok(period);
  }
}
