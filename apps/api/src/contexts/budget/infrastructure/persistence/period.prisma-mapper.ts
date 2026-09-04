import type { Period as PrismaPeriod } from '@prisma/client';

import { CalendarDate } from '../../../../shared/domain/calendar-date.vo';
import { Currency } from '../../../../shared/domain/currency.vo';
import { Money } from '../../../../shared/domain/money.vo';
import { Period, type PeriodHalf } from '../../domain/period.entity';

export const PeriodPrismaMapper = {
  toDomain(row: PrismaPeriod): Period {
    const currency = Currency.unsafe(row.plannedIncomeCurrency);
    return new Period({
      id: row.id,
      householdId: row.householdId,
      year: row.year,
      number: row.number,
      month: row.month,
      half: row.half as PeriodHalf,
      startDate: CalendarDate.fromDbDate(row.startDate),
      endDate: CalendarDate.fromDbDate(row.endDate),
      plannedIncome: row.plannedIncome ? Money.unsafe(row.plannedIncome.toString(), currency) : null,
      plannedIncomeCurrency: currency,
    });
  },

  toPersistence(period: Period): {
    id: string;
    householdId: string;
    year: number;
    number: number;
    month: number;
    half: PeriodHalf;
    startDate: Date;
    endDate: Date;
    plannedIncome: string | null;
    plannedIncomeCurrency: string;
  } {
    return {
      id: period.id,
      householdId: period.householdId,
      year: period.year,
      number: period.number,
      month: period.month,
      half: period.half,
      startDate: period.startDate.toUtcDate(),
      endDate: period.endDate.toUtcDate(),
      plannedIncome: period.plannedIncome ? period.plannedIncome.toFixed() : null,
      plannedIncomeCurrency: period.plannedIncomeCurrency.code,
    };
  },
};
