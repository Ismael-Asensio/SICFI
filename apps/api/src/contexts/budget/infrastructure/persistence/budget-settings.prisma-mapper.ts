import type { BudgetSettings as PrismaBudgetSettings } from '@prisma/client';

import { CalendarDate } from '../../../../shared/domain/calendar-date.vo';
import { Currency } from '../../../../shared/domain/currency.vo';
import { Money } from '../../../../shared/domain/money.vo';
import { Percentage } from '../../../../shared/domain/percentage.vo';
import { BudgetSettings } from '../../domain/budget-settings.entity';

/**
 * `savingGoalPerPeriod` y `paidToleranceAmount` no llevan su propia columna de
 * moneda: se asume la del household. El mapper la recibe aparte porque el
 * dominio no puede resolverla por sí solo (`BudgetSettings` no conoce su
 * `Household`).
 */
export const BudgetSettingsPrismaMapper = {
  toDomain(row: PrismaBudgetSettings, baseCurrency: Currency): BudgetSettings {
    return new BudgetSettings({
      id: row.id,
      householdId: row.householdId,
      year: row.year,
      name: row.name,
      activePeriodOverride: row.activePeriodOverride,
      controlStartDate: CalendarDate.fromDbDate(row.controlStartDate),
      spendThreshold: Percentage.unsafe(row.spendThreshold.toString()),
      dueSoonDays: row.dueSoonDays,
      inactivityDays: row.inactivityDays,
      savingGoalPerPeriod: Money.unsafe(row.savingGoalPerPeriod.toString(), baseCurrency),
      paidToleranceAmount: Money.unsafe(row.paidToleranceAmount.toString(), baseCurrency),
      disabledAlerts: row.disabledAlerts,
    });
  },

  toPersistence(settings: BudgetSettings): {
    id: string;
    householdId: string;
    year: number;
    name: string;
    activePeriodOverride: number | null;
    controlStartDate: Date;
    spendThreshold: string;
    dueSoonDays: number;
    inactivityDays: number;
    savingGoalPerPeriod: string;
    paidToleranceAmount: string;
    disabledAlerts: string[];
  } {
    return {
      id: settings.id,
      householdId: settings.householdId,
      year: settings.year,
      name: settings.name,
      activePeriodOverride: settings.activePeriodOverride,
      controlStartDate: settings.controlStartDate.toUtcDate(),
      spendThreshold: settings.spendThreshold.ratio.toFixed(3),
      dueSoonDays: settings.dueSoonDays,
      inactivityDays: settings.inactivityDays,
      savingGoalPerPeriod: settings.savingGoalPerPeriod.toFixed(),
      paidToleranceAmount: settings.paidToleranceAmount.toFixed(),
      disabledAlerts: [...settings.disabledAlerts],
    };
  },
};
