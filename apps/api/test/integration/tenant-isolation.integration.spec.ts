import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Currency } from '../../src/shared/domain/currency.vo';
import { Money } from '../../src/shared/domain/money.vo';
import { MissingTenantError } from '../../src/shared/infrastructure/tenant/missing-tenant.error';
import { PrismaCategoryRepository } from '../../src/contexts/catalog/infrastructure/persistence/prisma-category.repository';
import { PrismaSavingsFundRepository } from '../../src/contexts/catalog/infrastructure/persistence/prisma-savings-fund.repository';
import { Category } from '../../src/contexts/catalog/domain/category.entity';
import { SavingsFund } from '../../src/contexts/catalog/domain/savings-fund.entity';
import { PrismaHouseholdRepository } from '../../src/contexts/iam/infrastructure/persistence/prisma-household.repository';

import { scopedPrisma, sharedPrisma, tenantContext } from './support/shared-prisma';
import { createTestHousehold, type TestHousehold } from './support/test-household';

const NIO = Currency.NIO;

/**
 * El DoD de la Fase 5, literal: *"una consulta sin tenant lanza excepción"*.
 *
 * Y su complemento, que es lo que de verdad protege al usuario: dos households
 * A y B, y B no puede ver ni tocar NADA de A **aunque conozca los ids exactos**.
 * Es la capa 2 de CLAUDE.md §7 — la única que aísla de verdad, porque la RLS de
 * Postgres no se aplica a Prisma (el rol `postgres` tiene `rolbypassrls`).
 */
describe('Aislamiento de tenant (integración, sicfi-dev)', () => {
  let alpha: TestHousehold;
  let beta: TestHousehold;

  const categories = new PrismaCategoryRepository(scopedPrisma);
  const savingsFunds = new PrismaSavingsFundRepository(scopedPrisma);
  const households = new PrismaHouseholdRepository(scopedPrisma);

  beforeAll(async () => {
    alpha = await createTestHousehold();
    beta = await createTestHousehold();

    await alpha.run(async () => {
      await categories.save(
        new Category({
          id: 'cat-alpha-secreta',
          householdId: alpha.householdId,
          name: 'Categoría privada de Alpha',
          kind: 'VARIABLE',
          color: null,
          icon: null,
          isSystem: false,
          isActive: true,
          sortOrder: 0,
        })
      );
      await savingsFunds.save(
        new SavingsFund({
          id: 'fund-alpha-secreto',
          householdId: alpha.householdId,
          name: 'Fondo privado de Alpha',
          currency: NIO,
          targetAmount: Money.unsafe('50000', NIO),
          targetDate: null,
          isDefault: true,
          isActive: true,
        })
      );
    });
  }, 45_000);

  afterAll(async () => {
    await alpha.cleanup();
    await beta.cleanup();
  });

  describe('sin contexto de tenant', () => {
    it('una lectura lanza MissingTenantError en vez de devolver datos', async () => {
      await expect(categories.findMany(alpha.householdId)).rejects.toBeInstanceOf(MissingTenantError);
    });

    it('una escritura lanza MissingTenantError en vez de persistir', async () => {
      const intruder = new Category({
        id: 'cat-sin-contexto',
        householdId: alpha.householdId,
        name: 'No debería existir',
        kind: 'VARIABLE',
        color: null,
        icon: null,
        isSystem: false,
        isActive: true,
        sortOrder: 0,
      });

      await expect(categories.save(intruder)).rejects.toBeInstanceOf(MissingTenantError);

      // Y de verdad no se escribió nada: se comprueba con el cliente crudo.
      const row = await sharedPrisma.category.findUnique({ where: { id: 'cat-sin-contexto' } });
      expect(row).toBeNull();
    });

    it('el mensaje dice qué operación falló y cómo arreglarlo', async () => {
      await expect(categories.findMany(alpha.householdId)).rejects.toThrow(/Category\.findMany/);
      await expect(categories.findMany(alpha.householdId)).rejects.toThrow(/TenantContext\.runWith/);
    });
  });

  describe('household B contra los datos de A, conociendo sus ids', () => {
    it('no puede leer una categoría de A ni por id exacto', async () => {
      const found = await beta.run(() => categories.findById(alpha.householdId, 'cat-alpha-secreta'));
      expect(found).toBeNull();
    });

    it('no puede leer una categoría de A ni por nombre exacto', async () => {
      const found = await beta.run(() =>
        categories.findByName(alpha.householdId, 'Categoría privada de Alpha')
      );
      expect(found).toBeNull();
    });

    it('no ve nada de A al listar, aunque pase el householdId de A', async () => {
      const rows = await beta.run(() => categories.findMany(alpha.householdId));
      expect(rows).toHaveLength(0);
    });

    it('no puede leer un fondo de ahorro de A', async () => {
      const found = await beta.run(() => savingsFunds.findById(alpha.householdId, 'fund-alpha-secreto'));
      expect(found).toBeNull();
    });

    it('no puede leer el propio household de A por su id', async () => {
      const found = await beta.run(() => households.findById(alpha.householdId));
      expect(found).toBeNull();
    });

    it('un borrado dirigido a una fila de A no la toca', async () => {
      await beta.run(() => categories.delete(alpha.householdId, 'cat-alpha-secreta'));

      // Sigue ahí: el borrado se filtró por el household de B y no encontró nada.
      const survived = await sharedPrisma.category.findUnique({ where: { id: 'cat-alpha-secreta' } });
      expect(survived).not.toBeNull();
    });

    it('una edición dirigida a una fila de A no la modifica', async () => {
      const hijacked = new Category({
        id: 'cat-alpha-secreta',
        householdId: alpha.householdId,
        name: 'Nombre secuestrado por Beta',
        kind: 'FIJO',
        color: null,
        icon: null,
        isSystem: false,
        isActive: false,
        sortOrder: 99,
      });

      // El upsert se filtra por el household de B: no encuentra la fila de A,
      // así que intenta CREARLA con el householdId de B — y ahí choca con la
      // clave primaria, que ya existe. Falle o no, lo que importa es que la
      // fila de A quede intacta.
      await beta.run(() => categories.save(hijacked)).catch(() => undefined);

      const original = await sharedPrisma.category.findUniqueOrThrow({
        where: { id: 'cat-alpha-secreta' },
      });
      expect(original.name).toBe('Categoría privada de Alpha');
      expect(original.householdId).toBe(alpha.householdId);
    });

    it('A sí ve lo suyo: el aislamiento no rompe el caso normal', async () => {
      const found = await alpha.run(() => categories.findById(alpha.householdId, 'cat-alpha-secreta'));
      expect(found).not.toBeNull();
      expect(found?.name).toBe('Categoría privada de Alpha');
    });
  });

  describe('ámbito de sistema', () => {
    it('runAsSystem sí cruza households — es la puerta del alta de usuario', async () => {
      const found = await tenantContext.runAsSystem(() => households.findById(alpha.householdId));
      expect(found).not.toBeNull();
      expect(found?.id).toBe(alpha.householdId);
    });
  });
});
