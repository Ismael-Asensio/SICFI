import { NotFoundError, ValidationError, type DomainError } from '../../../../shared/domain/domain-error';
import type { Money } from '../../../../shared/domain/money.vo';
import { err, ok, type Result } from '../../../../shared/domain/result';
import { Period } from '../../domain/period.entity';
import type { PeriodRepository } from '../../domain/period.repository';

export interface SetPeriodPlannedIncomeCommand {
  householdId: string;
  periodId: string;
  plannedIncome: Money;
}

/**
 * Corrige P12 del Excel: ahí el ingreso venía precargado en las 24 filas, lo
 * que hacía parecer que el usuario ya había planificado el año entero. Aquí el
 * ingreso nace nulo (RN-06 lo trata como cero, dispara A01) y esta es la única
 * vía para declararlo, quincena a quincena.
 */
export class SetPeriodPlannedIncomeUseCase {
  constructor(private readonly periods: PeriodRepository) {}

  async execute(command: SetPeriodPlannedIncomeCommand): Promise<Result<Period, DomainError>> {
    const period = await this.periods.findById(command.householdId, command.periodId);
    if (!period) {
      return err(new NotFoundError('La quincena no existe', { periodId: command.periodId }));
    }
    if (!command.plannedIncome.isPositive()) {
      return err(new ValidationError('El ingreso planificado debe ser mayor que cero'));
    }

    const updated = new Period({
      id: period.id,
      householdId: period.householdId,
      year: period.year,
      number: period.number,
      month: period.month,
      half: period.half,
      startDate: period.startDate,
      endDate: period.endDate,
      plannedIncome: command.plannedIncome,
      plannedIncomeCurrency: command.plannedIncome.currency,
    });

    await this.periods.save(updated);
    return ok(updated);
  }
}
