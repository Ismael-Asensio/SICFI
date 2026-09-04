import type { SavingsFund as PrismaSavingsFund } from '@prisma/client';

import { CalendarDate } from '../../../../shared/domain/calendar-date.vo';
import { Currency } from '../../../../shared/domain/currency.vo';
import { Money } from '../../../../shared/domain/money.vo';
import { SavingsFund } from '../../domain/savings-fund.entity';

export const SavingsFundPrismaMapper = {
  toDomain(row: PrismaSavingsFund): SavingsFund {
    const currency = Currency.unsafe(row.currency);
    return new SavingsFund({
      id: row.id,
      householdId: row.householdId,
      name: row.name,
      currency,
      // .toString() antes de construir el Money: evita cualquier desajuste
      // entre el decimal.js interno de Prisma y el clon propio de Money.
      targetAmount: row.targetAmount ? Money.unsafe(row.targetAmount.toString(), currency) : null,
      targetDate: row.targetDate ? CalendarDate.fromDbDate(row.targetDate) : null,
      isDefault: row.isDefault,
      isActive: row.isActive,
    });
  },

  toPersistence(fund: SavingsFund): {
    id: string;
    householdId: string;
    name: string;
    currency: string;
    targetAmount: string | null;
    targetDate: Date | null;
    isDefault: boolean;
    isActive: boolean;
  } {
    return {
      id: fund.id,
      householdId: fund.householdId,
      name: fund.name,
      currency: fund.currency.code,
      targetAmount: fund.targetAmount ? fund.targetAmount.toFixed() : null,
      targetDate: fund.targetDate ? fund.targetDate.toUtcDate() : null,
      isDefault: fund.isDefault,
      isActive: fund.isActive,
    };
  },
};
