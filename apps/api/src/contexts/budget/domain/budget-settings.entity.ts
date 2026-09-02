/**
 * `BudgetSettings` — hoja `Config`, un registro por household y año (D5).
 */
import type { CalendarDate } from '../../../shared/domain/calendar-date.vo';
import { Entity } from '../../../shared/domain/entity';
import type { Money } from '../../../shared/domain/money.vo';
import type { Percentage } from '../../../shared/domain/percentage.vo';

export interface BudgetSettingsProps {
  id: string;
  householdId: string;
  year: number;
  name: string;
  /** null = quincena activa automática por fecha; 1..24 = override manual (RN-04). */
  activePeriodOverride: number | null;
  /** RN-35: nada con dependencia de fechas se evalúa antes de esta. */
  controlStartDate: CalendarDate;
  spendThreshold: Percentage;
  dueSoonDays: number;
  inactivityDays: number;
  savingGoalPerPeriod: Money;
  paidToleranceAmount: Money;
  /** Códigos de `AlertRule` desactivados por el usuario, p. ej. ['A07','A10']. */
  disabledAlerts: readonly string[];
}

export class BudgetSettings extends Entity<string> {
  readonly householdId: string;
  readonly year: number;
  readonly name: string;
  readonly activePeriodOverride: number | null;
  readonly controlStartDate: CalendarDate;
  readonly spendThreshold: Percentage;
  readonly dueSoonDays: number;
  readonly inactivityDays: number;
  readonly savingGoalPerPeriod: Money;
  readonly paidToleranceAmount: Money;
  readonly disabledAlerts: readonly string[];

  constructor(props: BudgetSettingsProps) {
    super(props.id);
    this.householdId = props.householdId;
    this.year = props.year;
    this.name = props.name;
    this.activePeriodOverride = props.activePeriodOverride;
    this.controlStartDate = props.controlStartDate;
    this.spendThreshold = props.spendThreshold;
    this.dueSoonDays = props.dueSoonDays;
    this.inactivityDays = props.inactivityDays;
    this.savingGoalPerPeriod = props.savingGoalPerPeriod;
    this.paidToleranceAmount = props.paidToleranceAmount;
    this.disabledAlerts = props.disabledAlerts;
  }

  with(changes: Partial<Omit<BudgetSettingsProps, 'id' | 'householdId' | 'year'>>): BudgetSettings {
    return new BudgetSettings({
      ...this,
      ...changes,
      id: this.id,
      householdId: this.householdId,
      year: this.year,
    });
  }
}
