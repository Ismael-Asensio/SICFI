import { NotFoundError, type DomainError } from '../../../../shared/domain/domain-error';
import { err, ok, type Result } from '../../../../shared/domain/result';
import type { HouseholdMember } from '../../domain/household-member.entity';
import type { HouseholdMemberRepository } from '../../domain/household-member.repository';
import { HouseholdPolicy, type HouseholdRole } from '../../domain/household-policy';

export interface ChangeMemberRoleCommand {
  householdId: string;
  /** Quién ejecuta la acción, para comprobar su rol y RN-44. */
  actingUserId: string;
  actingRole: HouseholdRole;
  targetMemberId: string;
  newRole: HouseholdRole;
}

/**
 * RN-43 y RN-44.
 *
 * Dos reglas que se comprueban aquí y no en el guard porque dependen del ESTADO
 * (quién es el objetivo, cuántos OWNER quedan), no solo del rol del que llama:
 *
 *   · solo un OWNER cambia roles (RN-43);
 *   · el último OWNER no puede degradarse a sí mismo (RN-44) — dejaría el
 *     household sin nadie capaz de gestionarlo.
 */
export class ChangeMemberRoleUseCase {
  constructor(private readonly members: HouseholdMemberRepository) {}

  async execute(command: ChangeMemberRoleCommand): Promise<Result<HouseholdMember, DomainError>> {
    const permitted = HouseholdPolicy.ensureCan(command.actingRole, 'member:change-role');
    if (!permitted.ok) return permitted;

    const target = await this.members.findById(command.householdId, command.targetMemberId);
    if (!target) {
      return err(
        new NotFoundError('Ese miembro no existe en el household', {
          memberId: command.targetMemberId,
        })
      );
    }

    if (target.role === 'OWNER' && command.newRole !== 'OWNER') {
      const ownerCount = await this.members.countByRole(command.householdId, 'OWNER');
      const remains = HouseholdPolicy.ensureOwnerRemains({
        memberRole: target.role,
        ownerCount,
        operation: 'demote',
      });
      if (!remains.ok) return remains;
    }

    const updated = target.withRole(command.newRole);
    await this.members.save(updated);
    return ok(updated);
  }
}
