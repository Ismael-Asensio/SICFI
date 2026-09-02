import type { HouseholdMember } from './household-member.entity';

export const HOUSEHOLD_MEMBER_REPOSITORY = Symbol('HOUSEHOLD_MEMBER_REPOSITORY');

export interface HouseholdMemberRepository {
  findById(householdId: string, id: string): Promise<HouseholdMember | null>;
  findByUser(householdId: string, userId: string): Promise<HouseholdMember | null>;
  /** Todos los households a los que pertenece un usuario — resuelve el JWT en cada request. */
  findByUserAcrossHouseholds(userId: string): Promise<HouseholdMember[]>;
  findByHousehold(householdId: string): Promise<HouseholdMember[]>;
  /** Cuenta cuántos OWNER quedan — lo usa `HouseholdPolicy.ensureOwnerRemains` (RN-44). */
  countByRole(householdId: string, role: HouseholdMember['role']): Promise<number>;
  save(member: HouseholdMember): Promise<void>;
  delete(householdId: string, id: string): Promise<void>;
}
