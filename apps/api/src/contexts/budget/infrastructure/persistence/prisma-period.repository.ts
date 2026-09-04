import { Injectable } from '@nestjs/common';

import type { CalendarDate } from '../../../../shared/domain/calendar-date.vo';
import { PrismaRepositoryBase } from '../../../../shared/infrastructure/prisma/prisma-repository.base';
import { TenantScopedPrisma } from '../../../../shared/infrastructure/prisma/tenant-scoped-prisma';
import type { Period } from '../../domain/period.entity';
import type { PeriodRepository } from '../../domain/period.repository';

import { PeriodPrismaMapper } from './period.prisma-mapper';

@Injectable()
export class PrismaPeriodRepository extends PrismaRepositoryBase implements PeriodRepository {
  constructor(scoped: TenantScopedPrisma) {
    super(scoped);
  }

  async findById(householdId: string, id: string): Promise<Period | null> {
    const row = await this.client.period.findFirst({ where: { id, householdId } });
    return row ? PeriodPrismaMapper.toDomain(row) : null;
  }

  async findByNumber(householdId: string, year: number, number: number): Promise<Period | null> {
    const row = await this.client.period.findUnique({
      where: { householdId_year_number: { householdId, year, number } },
    });
    return row ? PeriodPrismaMapper.toDomain(row) : null;
  }

  /** RN-03: la quincena cuyo `[startDate, endDate]` contiene `date`. */
  async findByDate(householdId: string, date: CalendarDate): Promise<Period | null> {
    const target = date.toUtcDate();
    const row = await this.client.period.findFirst({
      where: { householdId, startDate: { lte: target }, endDate: { gte: target } },
    });
    return row ? PeriodPrismaMapper.toDomain(row) : null;
  }

  async findByYear(householdId: string, year: number): Promise<Period[]> {
    const rows = await this.client.period.findMany({ where: { householdId, year } });
    return rows.map(PeriodPrismaMapper.toDomain);
  }

  async save(period: Period): Promise<void> {
    const data = PeriodPrismaMapper.toPersistence(period);
    await this.client.period.upsert({
      where: { id: period.id },
      create: data,
      update: {
        startDate: data.startDate,
        endDate: data.endDate,
        plannedIncome: data.plannedIncome,
        plannedIncomeCurrency: data.plannedIncomeCurrency,
      },
    });
  }

  /**
   * Un solo viaje para las 24 quincenas. Hacerlo con 24 `upsert` secuenciales
   * costaba ~7 s contra el pooler remoto y era una de las razones de que el
   * alta de usuario agotara el timeout de la transacción.
   */
  async saveMany(periods: readonly Period[]): Promise<void> {
    if (periods.length === 0) return;
    await this.client.period.createMany({
      data: periods.map(PeriodPrismaMapper.toPersistence),
      skipDuplicates: true,
    });
  }
}
