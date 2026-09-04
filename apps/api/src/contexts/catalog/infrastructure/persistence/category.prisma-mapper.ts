import type { Category as PrismaCategory } from '@prisma/client';

import { Category, type CategoryKind } from '../../domain/category.entity';

export const CategoryPrismaMapper = {
  toDomain(row: PrismaCategory): Category {
    return new Category({
      id: row.id,
      householdId: row.householdId,
      name: row.name,
      kind: row.kind as CategoryKind,
      color: row.color,
      icon: row.icon,
      isSystem: row.isSystem,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
    });
  },

  toPersistence(category: Category): {
    id: string;
    householdId: string;
    name: string;
    kind: CategoryKind;
    color: string | null;
    icon: string | null;
    isSystem: boolean;
    isActive: boolean;
    sortOrder: number;
  } {
    return {
      id: category.id,
      householdId: category.householdId,
      name: category.name,
      kind: category.kind,
      color: category.color,
      icon: category.icon,
      isSystem: category.isSystem,
      isActive: category.isActive,
      sortOrder: category.sortOrder,
    };
  },
};
