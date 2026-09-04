import type { HouseholdMember } from '../../domain/household-member.entity';
import type { HouseholdMemberRepository } from '../../domain/household-member.repository';

export class ListMembersUseCase {
  constructor(private readonly members: HouseholdMemberRepository) {}

  execute(householdId: string): Promise<HouseholdMember[]> {
    return this.members.findByHousehold(householdId);
  }
}
