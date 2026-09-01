/**
 * Cálculo del calendario de quincenas y derivación de `appliesTo`.
 *
 * ⚠️ UBICACIÓN TEMPORAL. En la Fase 3 esta lógica se muda a
 * `contexts/budget/domain/period-calculator.service.ts` y
 * `contexts/recurring/domain/`, y el seed pasará a importarla de allí.
 * Vive aquí ahora para que el seed no duplique reglas de negocio a mano.
 */

export type PeriodHalfName = 'Q1' | 'Q2';
export type AppliesToName = 'Q1' | 'Q2' | 'AMBAS';
export type FrequencyName = 'QUINCENAL' | 'MENSUAL' | 'BIMESTRAL' | 'SEMESTRAL' | 'ANUAL';

export interface PeriodCalendarEntry {
  number: number;
  month: number;
  half: PeriodHalfName;
  startDate: Date;
  endDate: Date;
}

/**
 * Construye una fecha de negocio anclada a las 12:00 UTC.
 *
 * El mediodía es deliberado. La columna es `@db.Date` y el driver serializa
 * desde un `Date` de JS; anclar al mediodía deja 12 horas de margen a cada lado,
 * así que ningún desfase de zona horaria puede empujar la fecha al día anterior
 * ni al siguiente. Es la trampa "el gasto se movió al día anterior".
 */
export function businessDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

/** Último día del mes: 28, 29, 30 o 31. Nunca se asume 30 (RN-21). */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Las 24 quincenas del año (RN-01, RN-02).
 * Q1 = días 1–15. Q2 = día 16 hasta el fin de mes real.
 */
export function buildPeriodCalendar(year: number): PeriodCalendarEntry[] {
  const periods: PeriodCalendarEntry[] = [];

  for (let month = 1; month <= 12; month += 1) {
    periods.push({
      number: (month - 1) * 2 + 1,
      month,
      half: 'Q1',
      startDate: businessDate(year, month, 1),
      endDate: businessDate(year, month, 15),
    });

    periods.push({
      number: (month - 1) * 2 + 2,
      month,
      half: 'Q2',
      startDate: businessDate(year, month, 16),
      endDate: businessDate(year, month, lastDayOfMonth(year, month)),
    });
  }

  return periods;
}

/**
 * Deriva `appliesTo` (RN-18).
 *
 *   QUINCENAL           → AMBAS
 *   cualquier otra       → dueDay <= 15 ? Q1 : Q2
 *
 * El cliente nunca envía este valor.
 */
export function deriveAppliesTo(frequency: FrequencyName, dueDay: number): AppliesToName {
  if (frequency === 'QUINCENAL') return 'AMBAS';
  return dueDay <= 15 ? 'Q1' : 'Q2';
}

/**
 * Fecha límite de un fijo dentro de una quincena (RN-21).
 *
 * El `min(dueDay, díaFinQuincena)` no es opcional: sin él, un fijo con
 * `dueDay = 31` produce una fecha inválida en febrero.
 */
export function computeDueDate(
  frequency: FrequencyName,
  dueDay: number,
  period: Pick<PeriodCalendarEntry, 'month' | 'half' | 'endDate'>,
  year: number
): Date {
  if (frequency === 'QUINCENAL') return period.endDate;

  const lastDayOfPeriod = period.half === 'Q1' ? 15 : lastDayOfMonth(year, period.month);
  return businessDate(year, period.month, Math.min(dueDay, lastDayOfPeriod));
}
