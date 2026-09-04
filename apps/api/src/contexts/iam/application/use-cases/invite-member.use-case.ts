import type { Clock } from '../../../../shared/domain/clock.port';
import {
  ConflictError,
  ValidationError,
  type DomainError,
} from '../../../../shared/domain/domain-error';
import type { IdGenerator } from '../../../../shared/domain/id-generator.port';
import { err, ok, type Result } from '../../../../shared/domain/result';
import { HouseholdInvite } from '../../domain/household-invite.entity';
import type { HouseholdInviteRepository } from '../../domain/household-invite.repository';
import { HouseholdPolicy, type HouseholdRole } from '../../domain/household-policy';

export interface InviteMemberCommand {
  householdId: string;
  actingRole: HouseholdRole;
  email: string;
  role: HouseholdRole;
}

const INVITE_TTL_DAYS = 7;

/**
 * Crea una invitación. **No envía el correo**: devuelve el token y quien llama
 * decide cómo hacerlo llegar. El envío es otra responsabilidad (y otra fase);
 * mezclarlo aquí ataría este caso de uso a un proveedor de email.
 */
export class InviteMemberUseCase {
  constructor(
    private readonly invites: HouseholdInviteRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock
  ) {}

  async execute(command: InviteMemberCommand): Promise<Result<HouseholdInvite, DomainError>> {
    const permitted = HouseholdPolicy.ensureCan(command.actingRole, 'member:invite');
    if (!permitted.ok) return permitted;

    const email = command.email.trim().toLowerCase();
    if (!email.includes('@')) {
      return err(new ValidationError('El email de la invitación no es válido', { email }));
    }

    // Un OWNER solo lo nombra una transferencia explícita (RN-44), nunca una
    // invitación: si no, invitar sería una puerta trasera para tener dos.
    if (command.role === 'OWNER') {
      return err(
        new ValidationError('No se puede invitar a alguien como OWNER; transfiere la propiedad')
      );
    }

    const existing = await this.invites.findByEmail(command.householdId, email);
    if (existing && !existing.isAccepted && !existing.isExpiredAt(this.clock)) {
      return err(new ConflictError('Ya hay una invitación pendiente para ese email', { email }));
    }

    const expiresAt = new Date(this.clock.now().getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
    const invite = new HouseholdInvite({
      id: existing?.id ?? this.ids.generate(),
      householdId: command.householdId,
      email,
      role: command.role,
      token: this.ids.generate(),
      expiresAt,
      acceptedAt: null,
    });

    await this.invites.save(invite);
    return ok(invite);
  }
}
