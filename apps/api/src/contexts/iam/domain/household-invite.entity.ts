/**
 * `HouseholdInvite` — invitación para incorporar a alguien a un household.
 *
 * El token es el secreto que viaja por email; el email del destinatario se
 * guarda para que solo esa persona pueda aceptarla (si no, cualquiera con el
 * enlace entraría).
 */
import type { Clock } from '../../../shared/domain/clock.port';
import { Entity } from '../../../shared/domain/entity';

import type { HouseholdRole } from './household-policy';

export interface HouseholdInviteProps {
  id: string;
  householdId: string;
  email: string;
  role: HouseholdRole;
  token: string;
  expiresAt: Date;
  acceptedAt: Date | null;
}

export class HouseholdInvite extends Entity<string> {
  readonly householdId: string;
  readonly email: string;
  readonly role: HouseholdRole;
  readonly token: string;
  readonly expiresAt: Date;
  readonly acceptedAt: Date | null;

  constructor(props: HouseholdInviteProps) {
    super(props.id);
    this.householdId = props.householdId;
    this.email = props.email;
    this.role = props.role;
    this.token = props.token;
    this.expiresAt = props.expiresAt;
    this.acceptedAt = props.acceptedAt;
  }

  get isAccepted(): boolean {
    return this.acceptedAt !== null;
  }

  isExpiredAt(clock: Clock): boolean {
    return this.expiresAt.getTime() <= clock.now().getTime();
  }

  /** Solo el destinatario puede aceptarla. La comparación ignora mayúsculas. */
  isAddressedTo(email: string): boolean {
    return this.email.trim().toLowerCase() === email.trim().toLowerCase();
  }

  markAccepted(at: Date): HouseholdInvite {
    return new HouseholdInvite({ ...this, id: this.id, acceptedAt: at });
  }
}
