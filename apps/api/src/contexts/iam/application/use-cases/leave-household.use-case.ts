import { NotFoundError, type DomainError } from '../../../../shared/domain/domain-error';
import { err, ok, type Result } from '../../../../shared/domain/result';
import type { HouseholdMemberRepository } from '../../domain/household-member.repository';
import { HouseholdPolicy } from '../../domain/household-policy';

export interface LeaveHouseholdCommand {
  householdId: string;
  userId: string;
}

/**
 * RN-44: el último OWNER no puede abandonar el household — dejaría un
 * presupuesto compartido sin nadie capaz de gestionarlo. Para salir, primero
 * hay que transferir la propiedad (`TransferOwnershipUseCase`).
 */
export class LeaveHouseholdUseCase {
  constructor(private readonly members: HouseholdMemberRepository) {}

  async execute(command: LeaveHouseholdCommand): Promise<Result<void, DomainError>> {
    const membership = await this.members.findByUser(command.householdId, command.userId);
    if (!membership) {
      return err(
        new NotFoundError('No perteneces a ese household', {
          householdId: command.householdId,
        })
      );
    }

    const ownerCount = await this.members.countByRole(command.householdId, 'OWNER');
    const remains = HouseholdPolicy.ensureOwnerRemains({
      memberRole: membership.role,
      ownerCount,
      operation: 'leave',
    });
    if (!remains.ok) return remains;

    await this.members.delete(command.householdId, membership.id);
    return ok();
  }
}
