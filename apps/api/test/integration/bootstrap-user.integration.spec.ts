import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import { CalendarDate } from '../../src/shared/domain/calendar-date.vo';
import { Currency } from '../../src/shared/domain/currency.vo';
import { RandomIdGenerator } from '../../src/shared/infrastructure/id/random-id-generator.adapter';
import { PrismaUnitOfWork } from '../../src/shared/infrastructure/prisma/prisma-unit-of-work';
import { PrismaCategoryRepository } from '../../src/contexts/catalog/infrastructure/persistence/prisma-category.repository';
import { PrismaPaymentMethodRepository } from '../../src/contexts/catalog/infrastructure/persistence/prisma-payment-method.repository';
import { PrismaSavingsFundRepository } from '../../src/contexts/catalog/infrastructure/persistence/prisma-savings-fund.repository';
import { DEFAULT_CATEGORIES, DEFAULT_PAYMENT_METHODS } from '../../src/contexts/catalog/domain/default-catalog';
import { PrismaBudgetSettingsRepository } from '../../src/contexts/budget/infrastructure/persistence/prisma-budget-settings.repository';
import { PrismaPeriodRepository } from '../../src/contexts/budget/infrastructure/persistence/prisma-period.repository';
import { PrismaHouseholdRepository } from '../../src/contexts/iam/infrastructure/persistence/prisma-household.repository';
import { PrismaHouseholdMemberRepository } from '../../src/contexts/iam/infrastructure/persistence/prisma-household-member.repository';
import { PrismaProfileRepository } from '../../src/contexts/iam/infrastructure/persistence/prisma-profile.repository';
import { PrismaUserRepository } from '../../src/contexts/iam/infrastructure/persistence/prisma-user.repository';
import { BootstrapUserUseCase } from '../../src/contexts/iam/application/use-cases/bootstrap-user.use-case';

import { sharedPrisma } from './support/shared-prisma';

/**
 * Vertical slice completo: 8 repositorios Prisma reales + PrismaUnitOfWork +
 * el caso de uso de onboarding, todo contra sicfi-dev. Es la prueba más
 * valiosa de la fase — si algo en el mapeo Prisma↔dominio está mal en
 * cualquiera de esos 8 repositorios, este test lo revienta.
 */
describe('BootstrapUserUseCase (integración, sicfi-dev)', () => {
  const createdHouseholdIds: string[] = [];
  const createdUserIds: string[] = [];

  afterEach(async () => {
    for (const id of createdHouseholdIds.splice(0)) {
      await sharedPrisma.household.delete({ where: { id } }).catch(() => undefined);
    }
    for (const id of createdUserIds.splice(0)) {
      await sharedPrisma.user.delete({ where: { id } }).catch(() => undefined);
    }
  });

  function buildUseCase(): BootstrapUserUseCase {
    return new BootstrapUserUseCase(
      new PrismaUserRepository(sharedPrisma),
      new PrismaProfileRepository(sharedPrisma),
      new PrismaHouseholdRepository(sharedPrisma),
      new PrismaHouseholdMemberRepository(sharedPrisma),
      new PrismaBudgetSettingsRepository(sharedPrisma),
      new PrismaPeriodRepository(sharedPrisma),
      new PrismaCategoryRepository(sharedPrisma),
      new PrismaPaymentMethodRepository(sharedPrisma),
      new PrismaSavingsFundRepository(sharedPrisma),
      new RandomIdGenerator(),
      new PrismaUnitOfWork(sharedPrisma)
    );
  }

  it('crea el onboarding completo y lo deja consistente en Postgres', async () => {
    const userId = randomUUID();
    createdUserIds.push(userId);

    const useCase = buildUseCase();
    const result = await useCase.execute({
      userId,
      email: `${userId}@integration.test`,
      displayName: 'Integración',
      householdName: `__integration_test__ bootstrap ${userId}`,
      baseCurrency: Currency.NIO,
      timezone: 'America/Managua',
      year: 2031, // año fuera de rango real para no chocar con datos de otros tests
      controlStartDate: CalendarDate.unsafe(2031, 1, 1),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    createdHouseholdIds.push(result.value.household.id);

    // Releído directamente de la base, no de lo que devolvió el caso de uso:
    // esto prueba el mapeo de lectura, no solo el de escritura.
    const [categories, paymentMethods, funds, periods, member, profile] = await Promise.all([
      sharedPrisma.category.findMany({ where: { householdId: result.value.household.id } }),
      sharedPrisma.paymentMethod.findMany({ where: { householdId: result.value.household.id } }),
      sharedPrisma.savingsFund.findMany({ where: { householdId: result.value.household.id } }),
      sharedPrisma.period.findMany({ where: { householdId: result.value.household.id } }),
      sharedPrisma.householdMember.findUnique({
        where: { householdId_userId: { householdId: result.value.household.id, userId } },
      }),
      sharedPrisma.profile.findUnique({ where: { userId } }),
    ]);

    expect(categories).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(paymentMethods).toHaveLength(DEFAULT_PAYMENT_METHODS.length);
    expect(funds).toHaveLength(1);
    expect(funds[0]?.isDefault).toBe(true);
    expect(periods).toHaveLength(24);
    expect(member?.role).toBe('OWNER');
    expect(profile?.activeHouseholdId).toBe(result.value.household.id);
  });

  it('es idempotente contra la base real: repetirlo no duplica nada', async () => {
    const userId = randomUUID();
    createdUserIds.push(userId);

    const command = {
      userId,
      email: `${userId}@integration.test`,
      displayName: 'Integración',
      householdName: `__integration_test__ idempotencia ${userId}`,
      baseCurrency: Currency.NIO,
      timezone: 'America/Managua',
      year: 2031,
      controlStartDate: CalendarDate.unsafe(2031, 1, 1),
    };

    const first = await buildUseCase().execute(command);
    if (!first.ok) throw first.error;
    createdHouseholdIds.push(first.value.household.id);

    const second = await buildUseCase().execute(command);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.household.id).toBe(first.value.household.id);

    const categories = await sharedPrisma.category.count({ where: { householdId: first.value.household.id } });
    expect(categories).toBe(DEFAULT_CATEGORIES.length);
  });
});
