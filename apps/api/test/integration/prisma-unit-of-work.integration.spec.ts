import { describe, expect, it } from 'vitest';

import { PrismaUnitOfWork } from '../../src/shared/infrastructure/prisma/prisma-unit-of-work';
import { PrismaCategoryRepository } from '../../src/contexts/catalog/infrastructure/persistence/prisma-category.repository';
import { Category } from '../../src/contexts/catalog/domain/category.entity';

import { sharedPrisma } from './support/shared-prisma';
import { createTestHousehold } from './support/test-household';

/**
 * La prueba central de la fase: si `work()` lanza a mitad de camino, nada de
 * lo que hizo antes debe quedar persistido. Sin esto, `PrismaUnitOfWork` sería
 * solo un nombre elegante para "llama a $transaction y espera lo mejor".
 */
describe('PrismaUnitOfWork (integración, sicfi-dev)', () => {
  it('revierte TODO si el trabajo lanza a mitad de camino', async () => {
    const household = await createTestHousehold();
    const categories = new PrismaCategoryRepository(sharedPrisma);
    const unitOfWork = new PrismaUnitOfWork(sharedPrisma);

    const attempt = unitOfWork.run(async () => {
      await categories.save(
        new Category({
          id: 'cat-uow-1',
          householdId: household.householdId,
          name: 'Se guarda primero',
          kind: 'VARIABLE',
          color: null,
          icon: null,
          isSystem: false,
          isActive: true,
          sortOrder: 0,
        })
      );
      await categories.save(
        new Category({
          id: 'cat-uow-2',
          householdId: household.householdId,
          name: 'Se guarda segundo',
          kind: 'VARIABLE',
          color: null,
          icon: null,
          isSystem: false,
          isActive: true,
          sortOrder: 1,
        })
      );
      throw new Error('fallo deliberado a mitad de la unidad de trabajo');
    });

    await expect(attempt).rejects.toThrow('fallo deliberado');

    // Ninguna de las dos categorías debe existir: ambas se escribieron DENTRO
    // de la misma transacción que terminó lanzando.
    const remaining = await categories.findMany(household.householdId);
    expect(remaining).toHaveLength(0);

    await household.cleanup();
  }, 30_000);

  it('persiste todo cuando el trabajo termina sin errores', async () => {
    const household = await createTestHousehold();
    const categories = new PrismaCategoryRepository(sharedPrisma);
    const unitOfWork = new PrismaUnitOfWork(sharedPrisma);

    await unitOfWork.run(async () => {
      await categories.save(
        new Category({
          id: 'cat-uow-3',
          householdId: household.householdId,
          name: 'Categoría A',
          kind: 'VARIABLE',
          color: null,
          icon: null,
          isSystem: false,
          isActive: true,
          sortOrder: 0,
        })
      );
      await categories.save(
        new Category({
          id: 'cat-uow-4',
          householdId: household.householdId,
          name: 'Categoría B',
          kind: 'VARIABLE',
          color: null,
          icon: null,
          isSystem: false,
          isActive: true,
          sortOrder: 1,
        })
      );
    });

    const remaining = await categories.findMany(household.householdId);
    expect(remaining).toHaveLength(2);

    await household.cleanup();
  }, 30_000);

  it('un repositorio usado FUERA de run() no ve la transacción: opera normal', async () => {
    const household = await createTestHousehold();
    const categories = new PrismaCategoryRepository(sharedPrisma);

    // Sin unitOfWork.run() de por medio: cada save() es su propia sentencia,
    // autocommit — es el camino que toman hoy los casos de uso que no
    // necesitan atomicidad multi-repositorio.
    await categories.save(
      new Category({
        id: 'cat-no-uow',
        householdId: household.householdId,
        name: 'Sin unidad de trabajo',
        kind: 'VARIABLE',
        color: null,
        icon: null,
        isSystem: false,
        isActive: true,
        sortOrder: 0,
      })
    );

    expect(await categories.findById(household.householdId, 'cat-no-uow')).not.toBeNull();

    await household.cleanup();
  });
});
