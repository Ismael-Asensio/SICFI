/**
 * `HouseholdMember` — la pertenencia de un usuario a un household, con su rol.
 * RN-42, RN-43.
 */
import { Entity } from '../../../shared/domain/entity';

import type { HouseholdRole } from './household-policy';

export interface HouseholdMemberProps {
  id: string;
  householdId: string;
  userId: string;
  role: HouseholdRole;
}

export class HouseholdMember extends Entity<string> {
  readonly householdId: string;
  readonly userId: string;
  readonly role: HouseholdRole;

  constructor(props: HouseholdMemberProps) {
    super(props.id);
    this.householdId = props.householdId;
    this.userId = props.userId;
    this.role = props.role;
  }

  withRole(role: HouseholdRole): HouseholdMember {
    return new HouseholdMember({
      id: this.id,
      householdId: this.householdId,
      userId: this.userId,
      role,
    });
  }
}
