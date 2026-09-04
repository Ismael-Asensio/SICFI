import { Injectable } from '@nestjs/common';

import { Currency } from '../../../../shared/domain/currency.vo';
import { PrismaRepositoryBase } from '../../../../shared/infrastructure/prisma/prisma-repository.base';
import { TenantScopedPrisma } from '../../../../shared/infrastructure/prisma/tenant-scoped-prisma';
import type { BudgetSettings } from '../../domain/budget-settings.entity';
import type { BudgetSettingsRepository } from '../../domain/budget-settings.repository';

import { BudgetSettingsPrismaMapper } from './budget-settings.prisma-mapper';

@Injectable()
export class PrismaBudgetSettingsRepository extends PrismaRepositoryBase implements BudgetSettingsRepository {
  constructor(scoped: TenantScopedPrisma) {
    super(scoped);
  }

  async findByYear(householdId: string, year: number): Promise<BudgetSettings | null> {
    const row = await this.client.budgetSettings.findUnique({
      where: { householdId_year: { householdId, year } },
      include: { household: true },
    });
    if (!row) return null;

    return BudgetSettingsPrismaMapper.toDomain(row, Currency.unsafe(row.household.baseCurrency));
  }

  async save(settings: BudgetSettings): Promise<void> {
    const data = BudgetSettingsPrismaMapper.toPersistence(settings);
    await this.client.budgetSettings.upsert({
      where: { id: settings.id },
      create: data,
      update: {
        name: data.name,
        activePeriodOverride: data.activePeriodOverride,
        spendThreshold: data.spendThreshold,
        dueSoonDays: data.dueSoonDays,
        inactivityDays: data.inactivityDays,
        savingGoalPerPeriod: data.savingGoalPerPeriod,
        paidToleranceAmount: data.paidToleranceAmount,
        disabledAlerts: data.disabledAlerts,
      },
    });
  }
}
