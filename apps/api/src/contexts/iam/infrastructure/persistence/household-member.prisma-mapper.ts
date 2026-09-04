import type { HouseholdMember as PrismaHouseholdMember } from '@prisma/client';

import { HouseholdMember } from '../../domain/household-member.entity';
import type { HouseholdRole } from '../../domain/household-policy';

export const HouseholdMemberPrismaMapper = {
  toDomain(row: PrismaHouseholdMember): HouseholdMember {
    return new HouseholdMember({
      id: row.id,
      householdId: row.householdId,
      userId: row.userId,
      role: row.role as HouseholdRole,
    });
  },

  toPersistence(member: HouseholdMember): {
    id: string;
    householdId: string;
    userId: string;
    role: HouseholdRole;
  } {
    return { id: member.id, householdId: member.householdId, userId: member.userId, role: member.role };
  },
};
