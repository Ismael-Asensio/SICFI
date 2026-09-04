import {
  BusinessRuleError,
  NotFoundError,
  type DomainError,
} from '../../../../shared/domain/domain-error';
import { err, ok, type Result } from '../../../../shared/domain/result';
import type { UnitOfWork } from '../../../../shared/domain/unit-of-work.port';
import type { HouseholdMemberRepository } from '../../domain/household-member.repository';
import { HouseholdPolicy, type HouseholdRole } from '../../domain/household-policy';

export interface TransferOwnershipCommand {
  householdId: string;
  actingUserId: string;
  actingRole: HouseholdRole;
  /** Miembro que pasa a ser OWNER. */
  targetMemberId: string;
}

/**
 * RN-44: "transferir la propiedad es una operación explícita".
 *
 * Es la vía por la que un OWNER **sí** puede dejar de serlo: promociona a otro
 * y se degrada a ADMIN en el mismo movimiento. Las dos escrituras van en una
 * unidad de trabajo porque el estado intermedio —dos OWNER, o ninguno— viola
 * la invariante de "exactamente un OWNER".
 */
export class TransferOwnershipUseCase {
  constructor(
    private readonly members: HouseholdMemberRepository,
    private readonly unitOfWork: UnitOfWork
  ) {}

  async execute(command: TransferOwnershipCommand): Promise<Result<void, DomainError>> {
    const permitted = HouseholdPolicy.ensureCan(command.actingRole, 'member:change-role');
    if (!permitted.ok) return permitted;

    const current = await this.members.findByUser(command.householdId, command.actingUserId);
    if (!current || current.role !== 'OWNER') {
      return err(
        new BusinessRuleError('RN-44', 'Solo el OWNER actual puede transferir la propiedad')
      );
    }

    const target = await this.members.findById(command.householdId, command.targetMemberId);
    if (!target) {
      return err(
        new NotFoundError('Ese miembro no existe en el household', {
          memberId: command.targetMemberId,
        })
      );
    }
    if (target.id === current.id) {
      return err(new BusinessRuleError('RN-44', 'Ya eres el OWNER de este household'));
    }

    await this.unitOfWork.run(async () => {
      await this.members.save(target.withRole('OWNER'));
      await this.members.save(current.withRole('ADMIN'));
    });

    return ok();
  }
}
