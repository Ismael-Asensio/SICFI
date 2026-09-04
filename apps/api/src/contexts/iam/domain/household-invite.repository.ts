import type { HouseholdInvite } from './household-invite.entity';

export const HOUSEHOLD_INVITE_REPOSITORY = Symbol('HOUSEHOLD_INVITE_REPOSITORY');

export interface HouseholdInviteRepository {
  findByToken(token: string): Promise<HouseholdInvite | null>;
  findByEmail(householdId: string, email: string): Promise<HouseholdInvite | null>;
  findByHousehold(householdId: string): Promise<HouseholdInvite[]>;
  save(invite: HouseholdInvite): Promise<void>;
  delete(householdId: string, id: string): Promise<void>;
}
