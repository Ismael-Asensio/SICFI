import type { CalendarDate } from '../../../shared/domain/calendar-date.vo';

import type { Period } from './period.entity';

export const PERIOD_REPOSITORY = Symbol('PERIOD_REPOSITORY');

export interface PeriodRepository {
  findById(householdId: string, id: string): Promise<Period | null>;
  findByNumber(householdId: string, year: number, number: number): Promise<Period | null>;
  /** RN-03: resuelve la quincena cuyo `[startDate, endDate]` contiene `date`. */
  findByDate(householdId: string, date: CalendarDate): Promise<Period | null>;
  findByYear(householdId: string, year: number): Promise<Period[]>;
  save(period: Period): Promise<void>;
  /** Alta en lote de quincenas nuevas; ignora las que ya existan por id. */
  saveMany(periods: readonly Period[]): Promise<void>;
}
