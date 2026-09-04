import { Injectable } from '@nestjs/common';

import { PrismaRepositoryBase } from '../../../../shared/infrastructure/prisma/prisma-repository.base';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import type { HouseholdMember } from '../../domain/household-member.entity';
import type { HouseholdMemberRepository } from '../../domain/household-member.repository';
import type { HouseholdRole } from '../../domain/household-policy';

import { HouseholdMemberPrismaMapper } from './household-member.prisma-mapper';

@Injectable()
export class PrismaHouseholdMemberRepository
  extends PrismaRepositoryBase
  implements HouseholdMemberRepository
{
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async findById(householdId: string, id: string): Promise<HouseholdMember | null> {
    const row = await this.client.householdMember.findFirst({ where: { id, householdId } });
    return row ? HouseholdMemberPrismaMapper.toDomain(row) : null;
  }

  async findByUser(householdId: string, userId: string): Promise<HouseholdMember | null> {
    const row = await this.client.householdMember.findUnique({
      where: { householdId_userId: { householdId, userId } },
    });
    return row ? HouseholdMemberPrismaMapper.toDomain(row) : null;
  }

  async findByUserAcrossHouseholds(userId: string): Promise<HouseholdMember[]> {
    const rows = await this.client.householdMember.findMany({ where: { userId } });
    return rows.map(HouseholdMemberPrismaMapper.toDomain);
  }

  async findByHousehold(householdId: string): Promise<HouseholdMember[]> {
    const rows = await this.client.householdMember.findMany({ where: { householdId } });
    return rows.map(HouseholdMemberPrismaMapper.toDomain);
  }

  async countByRole(householdId: string, role: HouseholdRole): Promise<number> {
    return this.client.householdMember.count({ where: { householdId, role } });
  }

  async save(member: HouseholdMember): Promise<void> {
    const data = HouseholdMemberPrismaMapper.toPersistence(member);
    await this.client.householdMember.upsert({
      where: { id: member.id },
      create: data,
      update: { role: data.role },
    });
  }

  async delete(householdId: string, id: string): Promise<void> {
    await this.client.householdMember.deleteMany({ where: { id, householdId } });
  }
}
