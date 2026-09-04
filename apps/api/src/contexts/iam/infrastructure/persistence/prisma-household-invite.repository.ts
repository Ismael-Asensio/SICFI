import { Injectable } from '@nestjs/common';
import type { HouseholdInvite as PrismaHouseholdInvite } from '@prisma/client';

import { PrismaRepositoryBase } from '../../../../shared/infrastructure/prisma/prisma-repository.base';
import { TenantScopedPrisma } from '../../../../shared/infrastructure/prisma/tenant-scoped-prisma';
import { HouseholdInvite } from '../../domain/household-invite.entity';
import type { HouseholdInviteRepository } from '../../domain/household-invite.repository';
import type { HouseholdRole } from '../../domain/household-policy';

function toDomain(row: PrismaHouseholdInvite): HouseholdInvite {
  return new HouseholdInvite({
    id: row.id,
    householdId: row.householdId,
    email: row.email,
    role: row.role as HouseholdRole,
    token: row.token,
    expiresAt: row.expiresAt,
    acceptedAt: row.acceptedAt,
  });
}

@Injectable()
export class PrismaHouseholdInviteRepository
  extends PrismaRepositoryBase
  implements HouseholdInviteRepository
{
  constructor(scoped: TenantScopedPrisma) {
    super(scoped);
  }

  /**
   * Se busca por token, sin `householdId`: quien acepta todavía no pertenece al
   * household. `AcceptInviteUseCase` la ejecuta en ámbito de sistema por eso
   * mismo, y allí valida el email antes de dejar entrar a nadie.
   */
  async findByToken(token: string): Promise<HouseholdInvite | null> {
    const row = await this.client.householdInvite.findUnique({ where: { token } });
    return row ? toDomain(row) : null;
  }

  async findByEmail(householdId: string, email: string): Promise<HouseholdInvite | null> {
    const row = await this.client.householdInvite.findUnique({
      where: { householdId_email: { householdId, email } },
    });
    return row ? toDomain(row) : null;
  }

  async findByHousehold(householdId: string): Promise<HouseholdInvite[]> {
    const rows = await this.client.householdInvite.findMany({ where: { householdId } });
    return rows.map(toDomain);
  }

  async save(invite: HouseholdInvite): Promise<void> {
    const data = {
      id: invite.id,
      householdId: invite.householdId,
      email: invite.email,
      role: invite.role,
      token: invite.token,
      expiresAt: invite.expiresAt,
      acceptedAt: invite.acceptedAt,
    };

    await this.client.householdInvite.upsert({
      where: { id: invite.id },
      create: data,
      update: {
        role: data.role,
        token: data.token,
        expiresAt: data.expiresAt,
        acceptedAt: data.acceptedAt,
      },
    });
  }

  async delete(householdId: string, id: string): Promise<void> {
    await this.client.householdInvite.deleteMany({ where: { id, householdId } });
  }
}
