import { describe, expect, it } from 'vitest';

import { PrismaUnitOfWork } from '../../src/shared/infrastructure/prisma/prisma-unit-of-work';
import { PrismaCategoryRepository } from '../../src/contexts/catalog/infrastructure/persistence/prisma-category.repository';
import { Category } from '../../src/contexts/catalog/domain/category.entity';

import { scopedPrisma } from './support/shared-prisma';
import { createTestHousehold, type TestHousehold } from './support/test-household';

function category(household: TestHousehold, id: string, name: string): Category {
  return new Category({
    id,
    householdId: household.householdId,
    name,
    kind: 'VARIABLE',
    color: null,
    icon: null,
    isSystem: false,
    isActive: true,
    sortOrder: 0,
  });
}

/**
 * La prueba central de la unidad de trabajo: si `work()` lanza a mitad de
 * camino, nada de lo que hizo antes debe quedar persistido. Sin esto,
 * `PrismaUnitOfWork` sería solo un nombre elegante para "llama a $transaction
 * y espera lo mejor".
 */
describe('PrismaUnitOfWork (integración, sicfi-dev)', () => {
  it('revierte TODO si el trabajo lanza a mitad de camino', async () => {
    const household = await createTestHousehold();
    const categories = new PrismaCategoryRepository(scopedPrisma);
    const unitOfWork = new PrismaUnitOfWork(scopedPrisma);

    try {
      const attempt = household.run(() =>
        unitOfWork.run(async () => {
          await categories.save(category(household, 'cat-uow-1', 'Se guarda primero'));
          await categories.save(category(household, 'cat-uow-2', 'Se guarda segundo'));
          throw new Error('fallo deliberado a mitad de la unidad de trabajo');
        })
      );

      await expect(attempt).rejects.toThrow('fallo deliberado');

      // Ninguna de las dos debe existir: ambas se escribieron DENTRO de la
      // misma transacción que terminó lanzando.
      const remaining = await household.run(() => categories.findMany(household.householdId));
      expect(remaining).toHaveLength(0);
    } finally {
      await household.cleanup();
    }
  }, 30_000);

  it('persiste todo cuando el trabajo termina sin errores', async () => {
    const household = await createTestHousehold();
    const categories = new PrismaCategoryRepository(scopedPrisma);
    const unitOfWork = new PrismaUnitOfWork(scopedPrisma);

    try {
      await household.run(() =>
        unitOfWork.run(async () => {
          await categories.save(category(household, 'cat-uow-3', 'Categoría A'));
          await categories.save(category(household, 'cat-uow-4', 'Categoría B'));
        })
      );

      const remaining = await household.run(() => categories.findMany(household.householdId));
      expect(remaining).toHaveLength(2);
    } finally {
      await household.cleanup();
    }
  }, 30_000);

  it('el cliente transaccional conserva el aislamiento por tenant', async () => {
    // Verifica lo que hace posible combinar las dos piezas: la extensión
    // sobrevive dentro de $transaction, así que una escritura hecha en una
    // unidad de trabajo sigue quedando marcada con SU household.
    const household = await createTestHousehold();
    const categories = new PrismaCategoryRepository(scopedPrisma);
    const unitOfWork = new PrismaUnitOfWork(scopedPrisma);

    try {
      await household.run(() =>
        unitOfWork.run(() =>
          categories.save(category(household, 'cat-uow-scope', 'Dentro de la transacción'))
        )
      );

      // Otro household no debe verla, ni siquiera conociendo su id.
      const other = await createTestHousehold();
      try {
        const leaked = await other.run(() =>
          categories.findById(household.householdId, 'cat-uow-scope')
        );
        expect(leaked).toBeNull();
      } finally {
        await other.cleanup();
      }
    } finally {
      await household.cleanup();
    }
  }, 30_000);

  it('sin unidad de trabajo, cada save() es su propia sentencia (autocommit)', async () => {
    const household = await createTestHousehold();
    const categories = new PrismaCategoryRepository(scopedPrisma);

    try {
      await household.run(() =>
        categories.save(category(household, 'cat-no-uow', 'Sin unidad de trabajo'))
      );

      const found = await household.run(() =>
        categories.findById(household.householdId, 'cat-no-uow')
      );
      expect(found).not.toBeNull();
    } finally {
      await household.cleanup();
    }
  });
});
