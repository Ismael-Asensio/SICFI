/**
 * `PeriodFactory` — genera el calendario de quincenas. RN-01, RN-02.
 *
 * Esta es la lógica que vivía provisionalmente en `prisma/seed-calendar.ts`
 * durante la Fase 2. Ahora es su sitio definitivo y el seed la importa de aquí.
 */
import { CalendarDate } from '../../../shared/domain/calendar-date.vo';
import { ValidationError, type DomainError } from '../../../shared/domain/domain-error';
import { err, ok, type Result } from '../../../shared/domain/result';

import type { PeriodHalf } from './period.entity';

export interface PeriodBlueprint {
  /** 1..24 */
  number: number;
  /** 1..12 */
  month: number;
  half: PeriodHalf;
  startDate: CalendarDate;
  endDate: CalendarDate;
}

export const PERIODS_PER_YEAR = 24;

export class PeriodFactory {
  /**
   * Las 24 quincenas de un año.
   *
   * `Q2` termina el último día real del mes: febrero cierra el 28 (o el 29 en
   * bisiesto), abril el 30. Asumir 30 dejaría días del año sin quincena, y un
   * gasto del 31 de enero no pertenecería a ninguna.
   */
  static buildYear(year: number): PeriodBlueprint[] {
    const periods: PeriodBlueprint[] = [];

    for (let month = 1; month <= 12; month += 1) {
      periods.push({
        number: PeriodFactory.numberFor(month, 'Q1'),
        month,
        half: 'Q1',
        startDate: CalendarDate.unsafe(year, month, 1),
        endDate: CalendarDate.unsafe(year, month, 15),
      });

      periods.push({
        number: PeriodFactory.numberFor(month, 'Q2'),
        month,
        half: 'Q2',
        startDate: CalendarDate.unsafe(year, month, 16),
        endDate: CalendarDate.unsafe(year, month, CalendarDate.lastDayOfMonth(year, month)),
      });
    }

    return periods;
  }

  /**
   * `number = (mes − 1) × 2 + (Q1 ? 1 : 2)`.
   * Es la misma fórmula que aplica el CHECK `period_number_matches_month`.
   */
  static numberFor(month: number, half: PeriodHalf): number {
    return (month - 1) * 2 + (half === 'Q1' ? 1 : 2);
  }

  /** Descompone un número de quincena en mes y mitad. */
  static decompose(number: number): Result<{ month: number; half: PeriodHalf }, DomainError> {
    if (!Number.isInteger(number) || number < 1 || number > PERIODS_PER_YEAR) {
      return err(
        new ValidationError(`Número de quincena fuera de rango: ${number}. Debe ser 1..24`, {
          number,
        })
      );
    }

    return ok({
      month: Math.floor((number - 1) / 2) + 1,
      half: number % 2 === 1 ? 'Q1' : 'Q2',
    });
  }

  /**
   * RN-03: la quincena a la que pertenece una fecha, dentro del año configurado.
   *
   * Devuelve `null` si la fecha cae fuera del año — quien llama decide si eso es
   * un error de validación o simplemente "no aplica".
   */
  static numberForDate(date: CalendarDate, year: number): number | null {
    if (date.year !== year) return null;
    return PeriodFactory.numberFor(date.month, date.day <= 15 ? 'Q1' : 'Q2');
  }
}
