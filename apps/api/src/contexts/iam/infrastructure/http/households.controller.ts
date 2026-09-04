/**
 * Gestión de miembros del household activo. RN-43 y RN-44.
 *
 * Estas rutas NO son `@NoTenant()`: operan sobre el household activo, así que
 * pasan por el aislamiento como cualquier otro dato. `@RequireRole` cubre el
 * "¿puedes?" de brocha gorda; las reglas que dependen del estado (¿queda algún
 * OWNER?, ¿el objetivo es el OWNER?) las aplica el caso de uso.
 */
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import {
  CurrentHousehold,
  CurrentUser,
  RequireRole,
  type AuthenticatedRequestContext,
} from '../../../../shared/infrastructure/http/auth.decorators';
import { toHttpException } from '../../../../shared/infrastructure/http/domain-error.mapper';
import { ChangeMemberRoleUseCase } from '../../application/use-cases/change-member-role.use-case';
import { InviteMemberUseCase } from '../../application/use-cases/invite-member.use-case';
import { LeaveHouseholdUseCase } from '../../application/use-cases/leave-household.use-case';
import { ListMembersUseCase } from '../../application/use-cases/list-members.use-case';
import { RemoveMemberUseCase } from '../../application/use-cases/remove-member.use-case';
import { TransferOwnershipUseCase } from '../../application/use-cases/transfer-ownership.use-case';
import type { HouseholdRole } from '../../domain/household-policy';

@Controller('households/current')
export class HouseholdsController {
  constructor(
    private readonly listMembers: ListMembersUseCase,
    private readonly changeRole: ChangeMemberRoleUseCase,
    private readonly removeMember: RemoveMemberUseCase,
    private readonly leave: LeaveHouseholdUseCase,
    private readonly transfer: TransferOwnershipUseCase,
    private readonly invite: InviteMemberUseCase
  ) {}

  @Get('members')
  async list(@CurrentHousehold() householdId: string) {
    const members = await this.listMembers.execute(householdId);
    return members.map(member => ({
      id: member.id,
      userId: member.userId,
      role: member.role,
    }));
  }

  @Post('invites')
  @RequireRole('ADMIN')
  // Cada invitación manda un correo a una dirección que elige quien invita:
  // sin límite, es un cañón de spam con nuestro dominio como remitente.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(201)
  async createInvite(
    @CurrentHousehold() householdId: string,
    @CurrentUser() user: AuthenticatedRequestContext,
    @Body() body: { email: string; role: HouseholdRole }
  ) {
    const result = await this.invite.execute({
      householdId,
      actingRole: user.role as HouseholdRole,
      email: body.email,
      role: body.role,
    });
    if (!result.ok) throw toHttpException(result.error);

    // El token se devuelve para que el llamante lo haga llegar: aquí no se
    // envía correo (ver `InviteMemberUseCase`).
    return { id: result.value.id, email: result.value.email, token: result.value.token };
  }

  @Patch('members/:memberId/role')
  @RequireRole('OWNER')
  async updateRole(
    @CurrentHousehold() householdId: string,
    @CurrentUser() user: AuthenticatedRequestContext,
    @Param('memberId') memberId: string,
    @Body() body: { role: HouseholdRole }
  ) {
    const result = await this.changeRole.execute({
      householdId,
      actingUserId: user.userId,
      actingRole: user.role as HouseholdRole,
      targetMemberId: memberId,
      newRole: body.role,
    });
    if (!result.ok) throw toHttpException(result.error);

    return { id: result.value.id, role: result.value.role };
  }

  @Post('transfer-ownership')
  @RequireRole('OWNER')
  @HttpCode(200)
  async transferOwnership(
    @CurrentHousehold() householdId: string,
    @CurrentUser() user: AuthenticatedRequestContext,
    @Body() body: { memberId: string }
  ) {
    const result = await this.transfer.execute({
      householdId,
      actingUserId: user.userId,
      actingRole: user.role as HouseholdRole,
      targetMemberId: body.memberId,
    });
    if (!result.ok) throw toHttpException(result.error);

    return { transferred: true };
  }

  /**
   * OJO AL ORDEN: esta ruta va ANTES que `members/:memberId`. Si se declara
   * después, Express casa `DELETE members/me` con el patrón de id y ejecuta la
   * expulsión (que exige ADMIN) en vez de la salida voluntaria.
   */
  @Delete('members/me')
  @HttpCode(204)
  async leaveHousehold(
    @CurrentHousehold() householdId: string,
    @CurrentUser() user: AuthenticatedRequestContext
  ): Promise<void> {
    const result = await this.leave.execute({ householdId, userId: user.userId });
    if (!result.ok) throw toHttpException(result.error);
  }

  @Delete('members/:memberId')
  @RequireRole('ADMIN')
  @HttpCode(204)
  async remove(
    @CurrentHousehold() householdId: string,
    @CurrentUser() user: AuthenticatedRequestContext,
    @Param('memberId') memberId: string
  ): Promise<void> {
    const result = await this.removeMember.execute({
      householdId,
      actingRole: user.role as HouseholdRole,
      targetMemberId: memberId,
    });
    if (!result.ok) throw toHttpException(result.error);
  }
}
