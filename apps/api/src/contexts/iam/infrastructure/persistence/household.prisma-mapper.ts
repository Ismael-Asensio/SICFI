import type { Household as PrismaHousehold } from '@prisma/client';

import { Currency } from '../../../../shared/domain/currency.vo';
import { Household } from '../../domain/household.entity';

export const HouseholdPrismaMapper = {
  toDomain(row: PrismaHousehold): Household {
    return new Household({
      id: row.id,
      name: row.name,
      baseCurrency: Currency.unsafe(row.baseCurrency),
      timezone: row.timezone,
    });
  },

  toPersistence(household: Household): { id: string; name: string; baseCurrency: string; timezone: string } {
    return {
      id: household.id,
      name: household.name,
      baseCurrency: household.baseCurrency.code,
      timezone: household.timezone,
    };
  },
};
