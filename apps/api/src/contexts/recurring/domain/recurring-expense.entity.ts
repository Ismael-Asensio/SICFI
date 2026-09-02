/**
 * `RecurringExpense` — un gasto fijo. RN-18 a RN-21.
 *
 * Las tres derivaciones que el cliente nunca envía viven aquí:
 * `appliesTo` (RN-18), `costoMensual`/`costoAnual` (RN-19) y `fechaLimite` (RN-21).
 */
import { CalendarDate } from '../../../shared/domain/calendar-date.vo';
import { Entity } from '../../../shared/domain/entity';
import { Money } from '../../../shared/domain/money.vo';
import type { PeriodHalf } from '../../budget/domain/period.entity';

import type { DueDay } from './due-day.vo';

export type Frequency = 'QUINCENAL' | 'MENSUAL' | 'BIMESTRAL' | 'SEMESTRAL' | 'ANUAL';
export type AppliesTo = 'Q1' | 'Q2' | 'AMBAS';

/** Cada cuántos meses se repite. `QUINCENAL` y `MENSUAL` ocurren todos los meses. */
const MONTH_CADENCE: Readonly<Record<Frequency, number>> = {
  QUINCENAL: 1,
  MENSUAL: 1,
  BIMESTRAL: 2,
  SEMESTRAL: 6,
  ANUAL: 12,
};

export interface RecurringExpenseProps {
  id: string;
  householdId: string;
  code: string;
  categoryId: string;
  concept: string;
  amount: Money;
  dueDay: DueDay;
  frequency: Frequency;
  paymentMethodId: string | null;
  isActive: boolean;
  notes: string | null;
  startDate: CalendarDate | null;
  endDate: CalendarDate | null;
}

/** Quincena mínima que necesita el fijo para situarse. Evita depender de `Period`. */
export interface PeriodRef {
  year: number;
  month: number;
  half: PeriodHalf;
  endDate: CalendarDate;
}

export class RecurringExpense extends Entity<string> {
  readonly householdId: string;
  readonly code: string;
  readonly categoryId: string;
  readonly concept: string;
  readonly amount: Money;
  readonly dueDay: DueDay;
  readonly frequency: Frequency;
  readonly paymentMethodId: string | null;
  readonly isActive: boolean;
  readonly notes: string | null;
  readonly startDate: CalendarDate | null;
  readonly endDate: CalendarDate | null;

  constructor(props: RecurringExpenseProps) {
    super(props.id);
    this.householdId = props.householdId;
    this.code = props.code;
    this.categoryId = props.categoryId;
    this.concept = props.concept;
    this.amount = props.amount;
    this.dueDay = props.dueDay;
    this.frequency = props.frequency;
    this.paymentMethodId = props.paymentMethodId;
    this.isActive = props.isActive;
    this.notes = props.notes;
    this.startDate = props.startDate;
    this.endDate = props.endDate;
  }

  with(changes: Partial<Omit<RecurringExpenseProps, 'id' | 'householdId' | 'code'>>): RecurringExpense {
    return new RecurringExpense({
      ...this,
      ...changes,
      id: this.id,
      householdId: this.householdId,
      code: this.code,
    });
  }

  // ─────────────────────────── RN-18 ───────────────────────────

  /**
   * `appliesTo` es **derivado y no editable**.
   *
   * Un fijo quincenal se paga en las dos mitades del mes; cualquier otro cae en
   * la mitad que marque su día de pago.
   */
  static deriveAppliesTo(frequency: Frequency, dueDay: DueDay): AppliesTo {
    if (frequency === 'QUINCENAL') return 'AMBAS';
    return dueDay.fallsInFirstHalf ? 'Q1' : 'Q2';
  }

  get appliesTo(): AppliesTo {
    return RecurringExpense.deriveAppliesTo(this.frequency, this.dueDay);
  }

  // ─────────────────────────── RN-19 ───────────────────────────

  /** `inactivo ? 0 : (quincenal ? monto × 2 : monto)`. */
  get monthlyCost(): Money {
    if (!this.isActive) return Money.zero(this.amount.currency);
    return this.frequency === 'QUINCENAL' ? this.amount.times(2) : this.amount;
  }

  get annualCost(): Money {
    return this.monthlyCost.times(12);
  }

  // ─────────────────────── Vigencia y cadencia ───────────────────────

  /**
   * ¿Este fijo aplica a esta quincena?
   *
   * Tres condiciones: estar activo, que la mitad coincida con `appliesTo`, y que
   * la quincena caiga dentro del periodo de vigencia. Un fijo dado de baja a
   * mitad de año no debe generar olvidos en las quincenas posteriores.
   */
  appliesToPeriod(period: PeriodRef): boolean {
    if (!this.isActive) return false;
    if (!this.isInForceDuring(period)) return false;
    if (!this.occursInMonth(period.month)) return false;

    const appliesTo = this.appliesTo;
    return appliesTo === 'AMBAS' || appliesTo === period.half;
  }

  /** La quincena cae dentro de `[startDate, endDate]` si están definidas. */
  isInForceDuring(period: PeriodRef): boolean {
    if (this.startDate && period.endDate.isBefore(this.startDate)) return false;
    if (this.endDate && period.endDate.isAfter(this.endDate)) return false;
    return true;
  }

  /**
   * Cadencia en meses. Un fijo bimestral no se paga todos los meses; contarlo
   * cada mes inflaría los fijos presupuestados de RN-07.
   *
   * El mes de referencia es el de `startDate`; sin él, enero.
   */
  occursInMonth(month: number): boolean {
    const cadence = MONTH_CADENCE[this.frequency];
    if (cadence === 1) return true;

    const anchor = this.startDate?.month ?? 1;
    return (((month - anchor) % cadence) + cadence) % cadence === 0;
  }

  // ─────────────────────────── RN-21 ───────────────────────────

  /**
   * Fecha límite de pago dentro de una quincena.
   *
   * - Quincenal → el cierre de la quincena.
   * - Cualquier otra → `fecha(año, mes, min(díaPago, díaFinDeQuincena))`.
   *
   * El `min` **no es opcional**: un fijo con `dueDay = 31` en febrero produciría
   * el 31 de febrero, que no existe. En una Q1 el tope es el 15.
   */
  dueDateIn(period: PeriodRef): CalendarDate {
    if (this.frequency === 'QUINCENAL') return period.endDate;

    const lastDayOfPeriod = period.half === 'Q1' ? 15 : period.endDate.day;
    return CalendarDate.unsafe(
      period.year,
      period.month,
      Math.min(this.dueDay.value, lastDayOfPeriod)
    );
  }
}
