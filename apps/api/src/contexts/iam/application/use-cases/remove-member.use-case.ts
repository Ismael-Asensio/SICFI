import { NotFoundError, type DomainError } from '../../../../shared/domain/domain-error';
import { err, ok, type Result } from '../../../../shared/domain/result';
import type { HouseholdMemberRepository } from '../../domain/household-member.repository';
import { HouseholdPolicy, type HouseholdRole } from '../../domain/household-policy';

export interface RemoveMemberCommand {
  householdId: string;
  actingRole: HouseholdRole;
  targetMemberId: string;
}

/**
 * Expulsa a un miembro. RN-43 y RN-44:
 *   · un ADMIN no puede expulsar al OWNER (si no, descabezaría el household);
 *   · el último OWNER no puede ser expulsado.
 */
export class RemoveMemberUseCase {
  constructor(private readonly members: HouseholdMemberRepository) {}

  async execute(command: RemoveMemberCommand): Promise<Result<void, DomainError>> {
    const target = await this.members.findById(command.householdId, command.targetMemberId);
    if (!target) {
      return err(
        new NotFoundError('Ese miembro no existe en el household', {
          memberId: command.targetMemberId,
        })
      );
    }

    const permitted = HouseholdPolicy.ensureCanRemoveMember({
      actorRole: command.actingRole,
      targetRole: target.role,
    });
    if (!permitted.ok) return permitted;

    if (target.role === 'OWNER') {
      const ownerCount = await this.members.countByRole(command.householdId, 'OWNER');
      const remains = HouseholdPolicy.ensureOwnerRemains({
        memberRole: target.role,
        ownerCount,
        operation: 'remove',
      });
      if (!remains.ok) return remains;
    }

    await this.members.delete(command.householdId, command.targetMemberId);
    return ok();
  }
}
