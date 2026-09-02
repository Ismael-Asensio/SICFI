/**
 * `Period` — una quincena. RN-01 a RN-05.
 *
 * `Q1` = días 1–15. `Q2` = día 16 al último del mes, que es 28, 29, 30 o 31.
 * Nunca se asume 30.
 */
import type { CalendarDate } from '../../../shared/domain/calendar-date.vo';
import type { Currency } from '../../../shared/domain/currency.vo';
import { Entity } from '../../../shared/domain/entity';
import type { Money } from '../../../shared/domain/money.vo';

export type PeriodHalf = 'Q1' | 'Q2';

export interface PeriodProps {
  id: string;
  householdId: string;
  year: number;
  /** 1..24 */
  number: number;
  /** 1..12 */
  month: number;
  half: PeriodHalf;
  startDate: CalendarDate;
  endDate: CalendarDate;
  /** `null` = aún no planificado. Dispara la alerta A01 (corrige P12 del Excel). */
  plannedIncome: Money | null;
  plannedIncomeCurrency: Currency;
}

export class Period extends Entity<string> {
  readonly householdId: string;
  readonly year: number;
  readonly number: number;
  readonly month: number;
  readonly half: PeriodHalf;
  readonly startDate: CalendarDate;
  readonly endDate: CalendarDate;
  readonly plannedIncome: Money | null;
  readonly plannedIncomeCurrency: Currency;

  constructor(props: PeriodProps) {
    super(props.id);
    this.householdId = props.householdId;
    this.year = props.year;
    this.number = props.number;
    this.month = props.month;
    this.half = props.half;
    this.startDate = props.startDate;
    this.endDate = props.endDate;
    this.plannedIncome = props.plannedIncome;
    this.plannedIncomeCurrency = props.plannedIncomeCurrency;
  }

  /** RN-03: la quincena de una fecha es aquella cuyo `[inicio, fin]` la contiene. */
  contains(date: CalendarDate): boolean {
    return date.isSameOrAfter(this.startDate) && date.isSameOrBefore(this.endDate);
  }

  /** RN-05: una quincena está cerrada si su fin ya pasó. */
  isClosedOn(today: CalendarDate): boolean {
    return this.endDate.isBefore(today);
  }

  isActiveOn(today: CalendarDate): boolean {
    return this.contains(today);
  }

  /**
   * Días que faltan para que cierre. 0 el último día; negativo si ya cerró.
   * El Panel lo muestra en la cabecera.
   */
  daysUntilCloseFrom(today: CalendarDate): number {
    return today.daysUntil(this.endDate);
  }

  /** Duración en días: 15 en Q1; 13, 14, 15 o 16 en Q2 según el mes. */
  get lengthInDays(): number {
    return this.startDate.daysUntil(this.endDate) + 1;
  }

  get hasPlannedIncome(): boolean {
    return this.plannedIncome !== null && this.plannedIncome.isPositive();
  }

  get label(): string {
    return `Q${this.half === 'Q1' ? 1 : 2} ${String(this.month).padStart(2, '0')}/${this.year}`;
  }
}
