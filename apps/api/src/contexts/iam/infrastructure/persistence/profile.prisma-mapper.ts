import type { Profile as PrismaProfile } from '@prisma/client';

import { Profile } from '../../domain/profile.entity';

export const ProfilePrismaMapper = {
  toDomain(row: PrismaProfile): Profile {
    return new Profile({
      id: row.id,
      userId: row.userId,
      displayName: row.displayName,
      locale: row.locale,
      timezone: row.timezone,
      activeHouseholdId: row.activeHouseholdId,
    });
  },

  toPersistence(profile: Profile): {
    id: string;
    userId: string;
    displayName: string;
    locale: string;
    timezone: string;
    activeHouseholdId: string | null;
  } {
    return {
      id: profile.id,
      userId: profile.userId,
      displayName: profile.displayName,
      locale: profile.locale,
      timezone: profile.timezone,
      activeHouseholdId: profile.activeHouseholdId,
    };
  },
};
