import { Injectable } from '@nestjs/common';

import { PrismaRepositoryBase } from '../../../../shared/infrastructure/prisma/prisma-repository.base';
import { TenantScopedPrisma } from '../../../../shared/infrastructure/prisma/tenant-scoped-prisma';
import type { PaymentMethod } from '../../domain/payment-method.entity';
import type { PaymentMethodRepository } from '../../domain/payment-method.repository';

import { PaymentMethodPrismaMapper } from './payment-method.prisma-mapper';

@Injectable()
export class PrismaPaymentMethodRepository extends PrismaRepositoryBase implements PaymentMethodRepository {
  constructor(scoped: TenantScopedPrisma) {
    super(scoped);
  }

  async findById(householdId: string, id: string): Promise<PaymentMethod | null> {
    const row = await this.client.paymentMethod.findFirst({ where: { id, householdId } });
    return row ? PaymentMethodPrismaMapper.toDomain(row) : null;
  }

  async findByName(householdId: string, name: string): Promise<PaymentMethod | null> {
    const row = await this.client.paymentMethod.findUnique({
      where: { householdId_name: { householdId, name } },
    });
    return row ? PaymentMethodPrismaMapper.toDomain(row) : null;
  }

  async findMany(householdId: string, options?: { activeOnly?: boolean }): Promise<PaymentMethod[]> {
    const rows = await this.client.paymentMethod.findMany({
      where: { householdId, ...(options?.activeOnly ? { isActive: true } : {}) },
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map(PaymentMethodPrismaMapper.toDomain);
  }

  async save(paymentMethod: PaymentMethod): Promise<void> {
    const data = PaymentMethodPrismaMapper.toPersistence(paymentMethod);
    await this.client.paymentMethod.upsert({
      where: { id: paymentMethod.id },
      create: data,
      update: { name: data.name, isActive: data.isActive, sortOrder: data.sortOrder },
    });
  }

  async createMany(paymentMethods: readonly PaymentMethod[]): Promise<void> {
    if (paymentMethods.length === 0) return;
    await this.client.paymentMethod.createMany({
      data: paymentMethods.map(PaymentMethodPrismaMapper.toPersistence),
      skipDuplicates: true,
    });
  }

  async delete(householdId: string, id: string): Promise<void> {
    await this.client.paymentMethod.deleteMany({ where: { id, householdId } });
  }
}
