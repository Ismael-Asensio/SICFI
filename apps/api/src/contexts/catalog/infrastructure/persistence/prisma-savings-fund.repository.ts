import { Injectable } from '@nestjs/common';

import { PrismaRepositoryBase } from '../../../../shared/infrastructure/prisma/prisma-repository.base';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import type { SavingsFund } from '../../domain/savings-fund.entity';
import type { SavingsFundRepository } from '../../domain/savings-fund.repository';

import { SavingsFundPrismaMapper } from './savings-fund.prisma-mapper';

@Injectable()
export class PrismaSavingsFundRepository extends PrismaRepositoryBase implements SavingsFundRepository {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async findById(householdId: string, id: string): Promise<SavingsFund | null> {
    const row = await this.client.savingsFund.findFirst({ where: { id, householdId } });
    return row ? SavingsFundPrismaMapper.toDomain(row) : null;
  }

  async findByName(householdId: string, name: string): Promise<SavingsFund | null> {
    const row = await this.client.savingsFund.findUnique({
      where: { householdId_name: { householdId, name } },
    });
    return row ? SavingsFundPrismaMapper.toDomain(row) : null;
  }

  async findMany(householdId: string, options?: { activeOnly?: boolean }): Promise<SavingsFund[]> {
    const rows = await this.client.savingsFund.findMany({
      where: { householdId, ...(options?.activeOnly ? { isActive: true } : {}) },
    });
    return rows.map(SavingsFundPrismaMapper.toDomain);
  }

  async save(fund: SavingsFund): Promise<void> {
    const data = SavingsFundPrismaMapper.toPersistence(fund);
    await this.client.savingsFund.upsert({
      where: { id: fund.id },
      create: data,
      update: {
        name: data.name,
        targetAmount: data.targetAmount,
        targetDate: data.targetDate,
        isDefault: data.isDefault,
        isActive: data.isActive,
      },
    });
  }
}
