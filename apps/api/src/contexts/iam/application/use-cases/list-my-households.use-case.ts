import type { TenantContext } from '../../../../shared/domain/tenant-context.port';
import type { HouseholdRole } from '../../domain/household-policy';
import type { HouseholdMemberRepository } from '../../domain/household-member.repository';
import type { HouseholdRepository } from '../../domain/household.repository';
import type { ProfileRepository } from '../../domain/profile.repository';

export interface HouseholdSummary {
  householdId: string;
  name: string;
  role: HouseholdRole;
  isActive: boolean;
}

/**
 * Los households a los que pertenece un usuario (RN-42).
 *
 * Cruza households por definición, así que corre en ámbito de sistema — es la
 * consulta que alimenta el selector de "¿en cuál estoy trabajando?".
 */
export class ListMyHouseholdsUseCase {
  constructor(
    private readonly members: HouseholdMemberRepository,
    private readonly households: HouseholdRepository,
    private readonly profiles: ProfileRepository,
    private readonly tenant: TenantContext
  ) {}

  execute(userId: string): Promise<HouseholdSummary[]> {
    return this.tenant.runAsSystem(async () => {
      const memberships = await this.members.findByUserAcrossHouseholds(userId);
      const profile = await this.profiles.findByUserId(userId);

      const summaries: HouseholdSummary[] = [];
      for (const membership of memberships) {
        const household = await this.households.findById(membership.householdId);
        if (!household) continue;

        summaries.push({
          householdId: household.id,
          name: household.name,
          role: membership.role,
          isActive: profile?.activeHouseholdId === household.id,
        });
      }

      return summaries;
    });
  }
}
