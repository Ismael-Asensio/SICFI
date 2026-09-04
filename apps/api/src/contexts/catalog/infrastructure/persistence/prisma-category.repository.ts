import { Injectable } from '@nestjs/common';

import { PrismaRepositoryBase } from '../../../../shared/infrastructure/prisma/prisma-repository.base';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import type { Category } from '../../domain/category.entity';
import type { CategoryRepository } from '../../domain/category.repository';

import { CategoryPrismaMapper } from './category.prisma-mapper';

@Injectable()
export class PrismaCategoryRepository extends PrismaRepositoryBase implements CategoryRepository {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async findById(householdId: string, id: string): Promise<Category | null> {
    const row = await this.client.category.findFirst({ where: { id, householdId } });
    return row ? CategoryPrismaMapper.toDomain(row) : null;
  }

  async findByName(householdId: string, name: string): Promise<Category | null> {
    const row = await this.client.category.findUnique({ where: { householdId_name: { householdId, name } } });
    return row ? CategoryPrismaMapper.toDomain(row) : null;
  }

  async findMany(householdId: string, options?: { activeOnly?: boolean }): Promise<Category[]> {
    const rows = await this.client.category.findMany({
      where: { householdId, ...(options?.activeOnly ? { isActive: true } : {}) },
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map(CategoryPrismaMapper.toDomain);
  }

  async save(category: Category): Promise<void> {
    const data = CategoryPrismaMapper.toPersistence(category);
    await this.client.category.upsert({
      where: { id: category.id },
      create: data,
      update: {
        name: data.name,
        kind: data.kind,
        color: data.color,
        icon: data.icon,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
      },
    });
  }

  async delete(householdId: string, id: string): Promise<void> {
    await this.client.category.deleteMany({ where: { id, householdId } });
  }
}
