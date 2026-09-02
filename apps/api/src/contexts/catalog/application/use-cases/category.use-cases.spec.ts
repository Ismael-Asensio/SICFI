import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryCategoryRepository } from '../../../../../test/doubles/catalog.doubles';
import { SequentialIdGenerator } from '../../../../../test/doubles/id-generator.double';
import { Category } from '../../domain/category.entity';

import { CreateCategoryUseCase } from './create-category.use-case';
import { DeleteCategoryUseCase } from './delete-category.use-case';
import { ListCategoriesUseCase } from './list-categories.use-case';
import { SetCategoryActiveUseCase } from './set-category-active.use-case';
import { UpdateCategoryUseCase } from './update-category.use-case';

const HOUSEHOLD = 'hh-1';

describe('CreateCategoryUseCase', () => {
  let repo: InMemoryCategoryRepository;
  let useCase: CreateCategoryUseCase;

  beforeEach(() => {
    repo = new InMemoryCategoryRepository();
    useCase = new CreateCategoryUseCase(repo, new SequentialIdGenerator());
  });

  it('crea una categoría nueva, no de sistema', async () => {
    const result = await useCase.execute({ householdId: HOUSEHOLD, name: 'Mascotas', kind: 'VARIABLE' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('Mascotas');
      expect(result.value.isSystem).toBe(false);
      expect(result.value.isActive).toBe(true);
    }
  });

  it('recorta espacios y rechaza un nombre vacío', async () => {
    expect((await useCase.execute({ householdId: HOUSEHOLD, name: '   ', kind: 'VARIABLE' })).ok).toBe(
      false
    );

    const result = await useCase.execute({ householdId: HOUSEHOLD, name: '  Salud  ', kind: 'VARIABLE' });
    expect(result.ok && result.value.name).toBe('Salud');
  });

  it('rechaza un nombre duplicado dentro del mismo household', async () => {
    await useCase.execute({ householdId: HOUSEHOLD, name: 'Salud', kind: 'VARIABLE' });
    const result = await useCase.execute({ householdId: HOUSEHOLD, name: 'Salud', kind: 'FIJO' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CONFLICT');
  });

  it('el mismo nombre en households distintos no choca', async () => {
    await useCase.execute({ householdId: HOUSEHOLD, name: 'Salud', kind: 'VARIABLE' });
    const result = await useCase.execute({ householdId: 'hh-2', name: 'Salud', kind: 'VARIABLE' });
    expect(result.ok).toBe(true);
  });
});

describe('UpdateCategoryUseCase', () => {
  let repo: InMemoryCategoryRepository;
  let create: CreateCategoryUseCase;
  let update: UpdateCategoryUseCase;

  beforeEach(() => {
    repo = new InMemoryCategoryRepository();
    create = new CreateCategoryUseCase(repo, new SequentialIdGenerator());
    update = new UpdateCategoryUseCase(repo);
  });

  it('actualiza los campos provistos y conserva el resto', async () => {
    const created = await create.execute({ householdId: HOUSEHOLD, name: 'Ocio', kind: 'VARIABLE' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = await update.execute({
      householdId: HOUSEHOLD,
      categoryId: created.value.id,
      color: '#FF0000',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.color).toBe('#FF0000');
      expect(result.value.name).toBe('Ocio');
    }
  });

  it('devuelve NotFoundError si la categoría no existe', async () => {
    const result = await update.execute({ householdId: HOUSEHOLD, categoryId: 'no-existe', name: 'X' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('rechaza renombrar a un nombre ya usado por otra categoría', async () => {
    await create.execute({ householdId: HOUSEHOLD, name: 'Ocio', kind: 'VARIABLE' });
    const second = await create.execute({ householdId: HOUSEHOLD, name: 'Salud', kind: 'VARIABLE' });
    if (!second.ok) throw second.error;

    const result = await update.execute({ householdId: HOUSEHOLD, categoryId: second.value.id, name: 'Ocio' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CONFLICT');
  });

  it('renombrar al mismo nombre que ya tenía no es un conflicto', async () => {
    const created = await create.execute({ householdId: HOUSEHOLD, name: 'Ocio', kind: 'VARIABLE' });
    if (!created.ok) throw created.error;

    const result = await update.execute({ householdId: HOUSEHOLD, categoryId: created.value.id, name: 'Ocio' });
    expect(result.ok).toBe(true);
  });
});

describe('SetCategoryActiveUseCase', () => {
  it('activa y desactiva', async () => {
    const repo = new InMemoryCategoryRepository();
    const create = new CreateCategoryUseCase(repo, new SequentialIdGenerator());
    const setActive = new SetCategoryActiveUseCase(repo);

    const created = await create.execute({ householdId: HOUSEHOLD, name: 'Ocio', kind: 'VARIABLE' });
    if (!created.ok) throw created.error;

    const deactivated = await setActive.execute({
      householdId: HOUSEHOLD,
      categoryId: created.value.id,
      isActive: false,
    });
    expect(deactivated.ok && deactivated.value.isActive).toBe(false);
  });
});

describe('DeleteCategoryUseCase', () => {
  it('borra una categoría creada por el usuario', async () => {
    const repo = new InMemoryCategoryRepository();
    const create = new CreateCategoryUseCase(repo, new SequentialIdGenerator());
    const del = new DeleteCategoryUseCase(repo);

    const created = await create.execute({ householdId: HOUSEHOLD, name: 'Ocio', kind: 'VARIABLE' });
    if (!created.ok) throw created.error;

    const result = await del.execute({ householdId: HOUSEHOLD, categoryId: created.value.id });
    expect(result.ok).toBe(true);
    expect(await repo.findById(HOUSEHOLD, created.value.id)).toBeNull();
  });

  it('rechaza borrar una categoría del sistema', async () => {
    const repo = new InMemoryCategoryRepository();
    await repo.save(
      new Category({
        id: 'system-1',
        householdId: HOUSEHOLD,
        name: 'Vivienda',
        kind: 'FIJO',
        color: null,
        icon: null,
        isSystem: true,
        isActive: true,
        sortOrder: 0,
      })
    );

    const del = new DeleteCategoryUseCase(repo);
    const result = await del.execute({ householdId: HOUSEHOLD, categoryId: 'system-1' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('BUSINESS_RULE_VIOLATION');
  });
});

describe('ListCategoriesUseCase', () => {
  it('ordena por sortOrder y filtra por activas', async () => {
    const repo = new InMemoryCategoryRepository();
    const create = new CreateCategoryUseCase(repo, new SequentialIdGenerator());
    const setActive = new SetCategoryActiveUseCase(repo);
    const list = new ListCategoriesUseCase(repo);

    const first = await create.execute({ householdId: HOUSEHOLD, name: 'B', kind: 'VARIABLE', sortOrder: 2 });
    const second = await create.execute({ householdId: HOUSEHOLD, name: 'A', kind: 'VARIABLE', sortOrder: 1 });
    if (!first.ok || !second.ok) throw new Error('setup');

    const all = await list.execute({ householdId: HOUSEHOLD });
    expect(all.map((c) => c.name)).toEqual(['A', 'B']);

    await setActive.execute({ householdId: HOUSEHOLD, categoryId: first.value.id, isActive: false });
    const activeOnly = await list.execute({ householdId: HOUSEHOLD, activeOnly: true });
    expect(activeOnly.map((c) => c.name)).toEqual(['A']);
  });
});
