import type { Clock } from '../../../../shared/domain/clock.port';
import {
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
  type DomainError,
} from '../../../../shared/domain/domain-error';
import type { IdGenerator } from '../../../../shared/domain/id-generator.port';
import { err, ok, type Result } from '../../../../shared/domain/result';
import type { TenantContext } from '../../../../shared/domain/tenant-context.port';
import type { UnitOfWork } from '../../../../shared/domain/unit-of-work.port';
import { HouseholdMember } from '../../domain/household-member.entity';
import type { HouseholdMemberRepository } from '../../domain/household-member.repository';
import type { HouseholdInviteRepository } from '../../domain/household-invite.repository';
import { User } from '../../domain/user.entity';
import type { UserRepository } from '../../domain/user.repository';

export interface AcceptInviteCommand {
  token: string;
  /** Quien acepta: sale del JWT, nunca del cuerpo de la petición. */
  userId: string;
  email: string;
}

export interface AcceptedInvite {
  householdId: string;
  member: HouseholdMember;
}

/**
 * Aceptar una invitación es, necesariamente, una operación **entre**
 * households: quien acepta todavía no pertenece al household de destino, así
 * que ninguna consulta suya lo encontraría bajo su propio ámbito. Por eso todo
 * el caso de uso corre en ámbito de sistema — y por eso las comprobaciones de
 * abajo son la única defensa que hay aquí:
 *
 *   · el token debe existir, no estar usado y no haber caducado;
 *   · **el email del JWT debe coincidir con el de la invitación**. Sin esto,
 *     cualquiera con el enlace entraría en un household ajeno.
 */
export class AcceptInviteUseCase {
  constructor(
    private readonly invites: HouseholdInviteRepository,
    private readonly members: HouseholdMemberRepository,
    private readonly users: UserRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly tenant: TenantContext,
    private readonly unitOfWork: UnitOfWork
  ) {}

  execute(command: AcceptInviteCommand): Promise<Result<AcceptedInvite, DomainError>> {
    return this.tenant.runAsSystem(async () => {
      const invite = await this.invites.findByToken(command.token);
      if (!invite) return err(new NotFoundError('Esa invitación no existe'));

      if (invite.isAccepted) {
        return err(new BusinessRuleError('invite-used', 'Esa invitación ya se usó'));
      }
      if (invite.isExpiredAt(this.clock)) {
        return err(new BusinessRuleError('invite-expired', 'Esa invitación ha caducado'));
      }
      if (!invite.isAddressedTo(command.email)) {
        // Mismo mensaje que "no existe" a propósito: confirmar que el token es
        // válido pero de otra persona ya es filtrar información.
        return err(new ForbiddenError('Esa invitación no es para esta cuenta'));
      }

      const alreadyMember = await this.members.findByUser(invite.householdId, command.userId);
      if (alreadyMember) {
        return err(new BusinessRuleError('already-member', 'Ya perteneces a ese household'));
      }

      const member = new HouseholdMember({
        id: this.ids.generate(),
        householdId: invite.householdId,
        userId: command.userId,
        role: invite.role,
      });

      await this.unitOfWork.run(async () => {
        // El usuario puede no existir aún en nuestra tabla espejo si su primera
        // acción tras registrarse es aceptar una invitación.
        const existingUser = await this.users.findById(command.userId);
        if (!existingUser) {
          await this.users.save(new User({ id: command.userId, email: command.email }));
        }
        await this.members.save(member);
        await this.invites.save(invite.markAccepted(this.clock.now()));
      });

      return ok({ householdId: invite.householdId, member });
    });
  }
}
