import {
  ForbiddenError,
  NotFoundError,
  type DomainError,
} from '../../../../shared/domain/domain-error';
import { err, ok, type Result } from '../../../../shared/domain/result';
import type { TenantContext } from '../../../../shared/domain/tenant-context.port';
import type { HouseholdMemberRepository } from '../../domain/household-member.repository';
import type { Profile } from '../../domain/profile.entity';
import type { ProfileRepository } from '../../domain/profile.repository';

export interface SwitchActiveHouseholdCommand {
  userId: string;
  householdId: string;
}

/**
 * Cambia el household que el usuario está viendo (RN-42).
 *
 * La comprobación que importa: **solo puede activar uno del que ya es
 * miembro**. Sin ella, escribir cualquier id en `activeHouseholdId` daría
 * acceso a datos ajenos en la siguiente petición, porque el `JwtAuthGuard`
 * confía en ese campo para resolver el tenant.
 */
export class SwitchActiveHouseholdUseCase {
  constructor(
    private readonly profiles: ProfileRepository,
    private readonly members: HouseholdMemberRepository,
    private readonly tenant: TenantContext
  ) {}

  execute(command: SwitchActiveHouseholdCommand): Promise<Result<Profile, DomainError>> {
    return this.tenant.runAsSystem(async () => {
      const membership = await this.members.findByUser(command.householdId, command.userId);
      if (!membership) {
        return err(
          new ForbiddenError('No perteneces a ese household', { householdId: command.householdId })
        );
      }

      const profile = await this.profiles.findByUserId(command.userId);
      if (!profile) {
        return err(new NotFoundError('El perfil no existe', { userId: command.userId }));
      }

      const updated = profile.withActiveHousehold(command.householdId);
      await this.profiles.save(updated);
      return ok(updated);
    });
  }
}
