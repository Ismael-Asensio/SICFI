import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaCategoryRepository } from '../../src/contexts/catalog/infrastructure/persistence/prisma-category.repository';
import { Category } from '../../src/contexts/catalog/domain/category.entity';

import { sharedPrisma } from './support/shared-prisma';
import { createTestHousehold, type TestHousehold } from './support/test-household';

describe('PrismaCategoryRepository (integración, sicfi-dev)', () => {
  let household: TestHousehold;
  let repo: PrismaCategoryRepository;

  beforeAll(async () => {
    household = await createTestHousehold();
    repo = new PrismaCategoryRepository(sharedPrisma);
  });

  afterAll(() => household.cleanup());

  it('guarda y recupera una categoría contra Postgres real', async () => {
    const category = new Category({
      id: 'cat-integration-1',
      householdId: household.householdId,
      name: 'Categoría de prueba',
      kind: 'VARIABLE',
      color: '#FF00FF',
      icon: null,
      isSystem: false,
      isActive: true,
      sortOrder: 3,
    });

    await repo.save(category);
    const found = await repo.findById(household.householdId, category.id);

    expect(found).not.toBeNull();
    expect(found?.name).toBe('Categoría de prueba');
    expect(found?.color).toBe('#FF00FF');
    expect(found?.kind).toBe('VARIABLE');
  });

  it('findByName respeta el aislamiento por householdId', async () => {
    const other = await createTestHousehold();
    try {
      await repo.save(
        new Category({
          id: 'cat-integration-2',
          householdId: household.householdId,
          name: 'Solo en este household',
          kind: 'FIJO',
          color: null,
          icon: null,
          isSystem: false,
          isActive: true,
          sortOrder: 0,
        })
      );

      expect(await repo.findByName(household.householdId, 'Solo en este household')).not.toBeNull();
      expect(await repo.findByName(other.householdId, 'Solo en este household')).toBeNull();
    } finally {
      await other.cleanup();
    }
  });

  it('update() persiste los cambios y delete() borra la fila', async () => {
    const category = new Category({
      id: 'cat-integration-3',
      householdId: household.householdId,
      name: 'Por editar',
      kind: 'VARIABLE',
      color: null,
      icon: null,
      isSystem: false,
      isActive: true,
      sortOrder: 0,
    });
    await repo.save(category);

    await repo.save(category.with({ isActive: false }));
    expect((await repo.findById(household.householdId, category.id))?.isActive).toBe(false);

    await repo.delete(household.householdId, category.id);
    expect(await repo.findById(household.householdId, category.id)).toBeNull();
  });
});
