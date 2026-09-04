import { Injectable } from '@nestjs/common';

import { PrismaRepositoryBase } from '../../../../shared/infrastructure/prisma/prisma-repository.base';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import type { Household } from '../../domain/household.entity';
import type { HouseholdRepository } from '../../domain/household.repository';

import { HouseholdPrismaMapper } from './household.prisma-mapper';

@Injectable()
export class PrismaHouseholdRepository extends PrismaRepositoryBase implements HouseholdRepository {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async findById(id: string): Promise<Household | null> {
    const row = await this.client.household.findUnique({ where: { id } });
    return row ? HouseholdPrismaMapper.toDomain(row) : null;
  }

  async save(household: Household): Promise<void> {
    const data = HouseholdPrismaMapper.toPersistence(household);
    await this.client.household.upsert({
      where: { id: household.id },
      create: data,
      update: { name: data.name, baseCurrency: data.baseCurrency, timezone: data.timezone },
    });
  }
}
