/**
 * `Profile` — preferencias del usuario y household activo. RN-42.
 *
 * `activeHouseholdId` es el que resuelve "¿qué datos ve este usuario ahora
 * mismo?" en cada request; un usuario puede pertenecer a varios households.
 */
import { Entity } from '../../../shared/domain/entity';

export interface ProfileProps {
  id: string;
  userId: string;
  displayName: string;
  locale: string;
  timezone: string;
  activeHouseholdId: string | null;
}

export class Profile extends Entity<string> {
  readonly userId: string;
  readonly displayName: string;
  readonly locale: string;
  readonly timezone: string;
  readonly activeHouseholdId: string | null;

  constructor(props: ProfileProps) {
    super(props.id);
    this.userId = props.userId;
    this.displayName = props.displayName;
    this.locale = props.locale;
    this.timezone = props.timezone;
    this.activeHouseholdId = props.activeHouseholdId;
  }

  withActiveHousehold(householdId: string): Profile {
    return new Profile({
      id: this.id,
      userId: this.userId,
      displayName: this.displayName,
      locale: this.locale,
      timezone: this.timezone,
      activeHouseholdId: householdId,
    });
  }
}
