import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CalendarDate } from '../../src/shared/domain/calendar-date.vo';
import { Currency } from '../../src/shared/domain/currency.vo';
import { Money } from '../../src/shared/domain/money.vo';
import { PrismaCategoryRepository } from '../../src/contexts/catalog/infrastructure/persistence/prisma-category.repository';
import { Category } from '../../src/contexts/catalog/domain/category.entity';
import { PrismaRecurringExpenseRepository } from '../../src/contexts/recurring/infrastructure/persistence/prisma-recurring-expense.repository';
import { DueDay } from '../../src/contexts/recurring/domain/due-day.vo';
import { RecurringExpense } from '../../src/contexts/recurring/domain/recurring-expense.entity';

import { sharedPrisma } from './support/shared-prisma';
import { createTestHousehold, type TestHousehold } from './support/test-household';

const NIO = Currency.NIO;

describe('PrismaRecurringExpenseRepository (integración, sicfi-dev)', () => {
  let household: TestHousehold;
  let categoryId: string;
  let repo: PrismaRecurringExpenseRepository;

  beforeAll(async () => {
    household = await createTestHousehold();
    const category = new Category({
      id: 'cat-fijo-integration',
      householdId: household.householdId,
      name: 'Vivienda (integración)',
      kind: 'FIJO',
      color: null,
      icon: null,
      isSystem: false,
      isActive: true,
      sortOrder: 0,
    });
    await new PrismaCategoryRepository(sharedPrisma).save(category);
    categoryId = category.id;
    repo = new PrismaRecurringExpenseRepository(sharedPrisma);
  });

  afterAll(() => household.cleanup());

  it('conserva el importe, el DueDay y deriva appliesTo al releer (RN-18)', async () => {
    const expense = new RecurringExpense({
      id: 'exp-integration-1',
      householdId: household.householdId,
      code: 'F01',
      categoryId,
      concept: 'Apoyo Casa (integración)',
      amount: Money.unsafe('2500.00', NIO),
      dueDay: DueDay.unsafe(5),
      frequency: 'QUINCENAL',
      paymentMethodId: null,
      isActive: true,
      notes: null,
      startDate: null,
      endDate: null,
    });

    await repo.save(expense);
    const found = await repo.findById(household.householdId, expense.id);

    expect(found).not.toBeNull();
    expect(found?.amount.toFixed()).toBe('2500.00');
    expect(found?.dueDay.value).toBe(5);
    expect(found?.appliesTo).toBe('AMBAS');
  });

  it('persiste la columna applies_to derivada, para que SQL pueda agregar por ella (RN-07)', async () => {
    const expense = new RecurringExpense({
      id: 'exp-integration-2',
      householdId: household.householdId,
      code: 'F02',
      categoryId,
      concept: 'Teléfono (integración)',
      amount: Money.unsafe('700.00', NIO),
      dueDay: DueDay.unsafe(28),
      frequency: 'MENSUAL',
      paymentMethodId: null,
      isActive: true,
      notes: null,
      startDate: null,
      endDate: null,
    });
    await repo.save(expense);

    const raw = await sharedPrisma.recurringExpense.findUniqueOrThrow({ where: { id: expense.id } });
    expect(raw.appliesTo).toBe('Q2');
  });

  it('respeta las dos claves únicas por household: code y concept', async () => {
    const found = await repo.findByCode(household.householdId, 'F01');
    expect(found?.concept).toBe('Apoyo Casa (integración)');

    const byConcept = await repo.findByConcept(household.householdId, 'Teléfono (integración)');
    expect(byConcept?.code).toBe('F02');
  });

  it('conserva la vigencia (startDate/endDate) al ir y volver de Postgres', async () => {
    const expense = new RecurringExpense({
      id: 'exp-integration-3',
      householdId: household.householdId,
      code: 'F03',
      categoryId,
      concept: 'Seguro anual (integración)',
      amount: Money.unsafe('1200.00', NIO),
      dueDay: DueDay.unsafe(15),
      frequency: 'ANUAL',
      paymentMethodId: null,
      isActive: true,
      notes: 'Vence a mitad de año',
      startDate: CalendarDate.unsafe(2026, 6, 1),
      endDate: CalendarDate.unsafe(2026, 12, 31),
    });
    await repo.save(expense);

    const found = await repo.findById(household.householdId, expense.id);
    expect(found?.startDate?.toISO()).toBe('2026-06-01');
    expect(found?.endDate?.toISO()).toBe('2026-12-31');
    expect(found?.notes).toBe('Vence a mitad de año');
  });
});
