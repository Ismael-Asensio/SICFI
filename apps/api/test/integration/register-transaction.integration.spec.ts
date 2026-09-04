import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CalendarDate } from '../../src/shared/domain/calendar-date.vo';
import { Currency } from '../../src/shared/domain/currency.vo';
import { FixedClock } from '../../src/shared/infrastructure/clock/system-clock.adapter';
import { RandomIdGenerator } from '../../src/shared/infrastructure/id/random-id-generator.adapter';
import { PrismaExchangeRateAdapter } from '../../src/shared/infrastructure/prisma/prisma-exchange-rate.adapter';
import { Money } from '../../src/shared/domain/money.vo';
import { PrismaCategoryRepository } from '../../src/contexts/catalog/infrastructure/persistence/prisma-category.repository';
import { PrismaPaymentMethodRepository } from '../../src/contexts/catalog/infrastructure/persistence/prisma-payment-method.repository';
import { PrismaSavingsFundRepository } from '../../src/contexts/catalog/infrastructure/persistence/prisma-savings-fund.repository';
import { Category } from '../../src/contexts/catalog/domain/category.entity';
import { SavingsFund } from '../../src/contexts/catalog/domain/savings-fund.entity';
import { PrismaPeriodRepository } from '../../src/contexts/budget/infrastructure/persistence/prisma-period.repository';
import { PeriodFactory } from '../../src/contexts/budget/domain/period-factory.service';
import { Period } from '../../src/contexts/budget/domain/period.entity';
import { PrismaHouseholdRepository } from '../../src/contexts/iam/infrastructure/persistence/prisma-household.repository';
import { PrismaRecurringExpenseRepository } from '../../src/contexts/recurring/infrastructure/persistence/prisma-recurring-expense.repository';
import { PrismaTransactionRepository } from '../../src/contexts/ledger/infrastructure/persistence/prisma-transaction.repository';
import {
  RegisterTransactionUseCase,
  type RegisterTransactionCommand,
} from '../../src/contexts/ledger/application/use-cases/register-transaction.use-case';
import { UpdateTransactionUseCase } from '../../src/contexts/ledger/application/use-cases/update-transaction.use-case';

import { sharedPrisma } from './support/shared-prisma';
import { createTestHousehold, type TestHousehold } from './support/test-household';

const NIO = Currency.NIO;
const USD = Currency.USD;
const date = (iso: string): CalendarDate => {
  const result = CalendarDate.fromISO(iso);
  if (!result.ok) throw result.error;
  return result.value;
};

/**
 * El vertical slice del núcleo transaccional: 6 repositorios Prisma reales +
 * el adaptador de tipo de cambio + los dos casos de uso más complejos del
 * sistema. Verifica lo que ningún test con dobles puede: que `Decimal(18,8)`
 * sobrevive el viaje de ida y vuelta a Postgres sin perder precisión.
 */
describe('RegisterTransactionUseCase / UpdateTransactionUseCase (integración, sicfi-dev)', () => {
  let household: TestHousehold;
  let categoryId: string;
  let fundId: string;
  const periodIds: Record<number, string> = {};

  const categories = new PrismaCategoryRepository(sharedPrisma);
  const paymentMethods = new PrismaPaymentMethodRepository(sharedPrisma);
  const recurringExpenses = new PrismaRecurringExpenseRepository(sharedPrisma);
  const savingsFunds = new PrismaSavingsFundRepository(sharedPrisma);
  const periods = new PrismaPeriodRepository(sharedPrisma);
  const households = new PrismaHouseholdRepository(sharedPrisma);
  const transactions = new PrismaTransactionRepository(sharedPrisma);
  const exchangeRates = new PrismaExchangeRateAdapter(sharedPrisma);

  function buildRegisterUseCase(): RegisterTransactionUseCase {
    return new RegisterTransactionUseCase(
      transactions,
      households,
      categories,
      paymentMethods,
      recurringExpenses,
      savingsFunds,
      periods,
      exchangeRates,
      new RandomIdGenerator(),
      FixedClock.atISO('2026-03-10T18:00:00Z')
    );
  }

  function buildUpdateUseCase(): UpdateTransactionUseCase {
    return new UpdateTransactionUseCase(
      transactions,
      households,
      categories,
      paymentMethods,
      recurringExpenses,
      savingsFunds,
      periods,
      exchangeRates,
      FixedClock.atISO('2026-03-15T18:00:00Z')
    );
  }

  beforeAll(async () => {
    household = await createTestHousehold();

    const category = new Category({
      id: 'cat-ledger-integration',
      householdId: household.householdId,
      name: 'Supermercado (integración)',
      kind: 'VARIABLE',
      color: null,
      icon: null,
      isSystem: false,
      isActive: true,
      sortOrder: 0,
    });
    await categories.save(category);
    categoryId = category.id;

    const fund = new SavingsFund({
      id: 'fund-ledger-integration',
      householdId: household.householdId,
      name: 'Fondo de integración',
      currency: NIO,
      targetAmount: null,
      targetDate: null,
      isDefault: true,
      isActive: true,
    });
    await savingsFunds.save(fund);
    fundId = fund.id;

    const blueprints = PeriodFactory.buildYear(2026);
    for (const blueprint of blueprints) {
      const period = new Period({
        id: `period-ledger-integration-${blueprint.number}`,
        householdId: household.householdId,
        year: 2026,
        number: blueprint.number,
        month: blueprint.month,
        half: blueprint.half,
        startDate: blueprint.startDate,
        endDate: blueprint.endDate,
        plannedIncome: Money.unsafe('8500', NIO),
        plannedIncomeCurrency: NIO,
      });
      await periods.save(period);
      periodIds[blueprint.number] = period.id;
    }

    // Dos tasas USD→NIO para probar RN-37 (exacta y "más reciente anterior") contra Postgres real.
    await sharedPrisma.exchangeRate.create({
      data: {
        householdId: household.householdId,
        baseCurrency: 'NIO',
        quoteCurrency: 'USD',
        date: date('2026-01-15').toUtcDate(),
        rate: '36.12345678',
        source: 'MANUAL',
      },
    });
    await sharedPrisma.exchangeRate.create({
      data: {
        householdId: household.householdId,
        baseCurrency: 'NIO',
        quoteCurrency: 'USD',
        date: date('2026-06-01').toUtcDate(),
        rate: '40.00000000',
        source: 'MANUAL',
      },
    });
  }, 30_000);

  afterAll(() => household.cleanup());

  const baseCommand = (): RegisterTransactionCommand => ({
    householdId: household.householdId,
    createdByUserId: household.userId,
    date: date('2026-03-10'),
    type: 'VARIABLE',
    categoryId,
    concept: 'Compra de integración',
    amount: Money.unsafe('500', NIO),
    status: 'PAGADO',
  });

  it('registra un movimiento y deriva la quincena contra Postgres real (RN-29)', async () => {
    const result = await buildRegisterUseCase().execute(baseCommand());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.periodId).toBe(periodIds[5]); // Q1 de marzo

    const row = await sharedPrisma.transaction.findUniqueOrThrow({ where: { id: result.value.id } });
    expect(row.baseAmount.toString()).toBe('500');
  });

  it('RN-36/RN-37: la tasa Decimal(18,8) sobrevive el viaje de ida y vuelta sin perder precisión', async () => {
    const result = await buildRegisterUseCase().execute({
      ...baseCommand(),
      amount: Money.unsafe('100', USD),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 100 × 36.12345678 = 3612.345678 → redondeado a 2 decimales en baseAmount.
    expect(result.value.exchangeRate.toString()).toBe('36.12345678');
    expect(result.value.baseAmount.toFixed()).toBe('3612.35');

    const row = await sharedPrisma.transaction.findUniqueOrThrow({ where: { id: result.value.id } });
    // La fila cruda de Postgres, no lo que el mapper reconstruyó: prueba que
    // Decimal(18,8) no se truncó en el camino de escritura.
    expect(row.exchangeRate.toString()).toBe('36.12345678');
  });

  it('usa la tasa más reciente ANTERIOR cuando no hay una exacta para la fecha (RN-37)', async () => {
    const result = await buildRegisterUseCase().execute({
      ...baseCommand(),
      date: date('2026-02-10'), // entre las dos tasas sembradas
      amount: Money.unsafe('100', USD),
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.exchangeRate.toNumber()).toBe(36.12345678);
  });

  it('rechaza un FIJO sin gasto fijo existente en la base (RN-26)', async () => {
    const result = await buildRegisterUseCase().execute({
      ...baseCommand(),
      type: 'FIJO',
      recurringExpenseId: 'no-existe-de-verdad',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.details.rule).toBe('RN-26');
  });

  it('RN-41: un retiro mayor que el saldo real del fondo se rechaza', async () => {
    const result = await buildRegisterUseCase().execute({
      ...baseCommand(),
      type: 'RETIRO_AHORRO',
      savingsFundId: fundId,
      amount: Money.unsafe('999999', NIO),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.details.rule).toBe('RN-41');
  });

  it('getSavingsFundTotals agrega correctamente vía groupBy contra Postgres real', async () => {
    await buildRegisterUseCase().execute({
      ...baseCommand(),
      type: 'AHORRO',
      savingsFundId: fundId,
      amount: Money.unsafe('1500', NIO),
    });
    await buildRegisterUseCase().execute({
      ...baseCommand(),
      type: 'RETIRO_AHORRO',
      savingsFundId: fundId,
      amount: Money.unsafe('1400', NIO),
    });

    const totals = await transactions.getSavingsFundTotals(household.householdId, fundId);
    // RN-41b: el saldo neto es el que importa, no el bruto.
    expect(totals.contributions.minus(totals.withdrawals).toFixed()).toBe('100.00');
  });

  it('UpdateTransactionUseCase: RN-38 no recalcula la tasa si no cambian fecha ni moneda', async () => {
    const created = await buildRegisterUseCase().execute({
      ...baseCommand(),
      amount: Money.unsafe('100', USD),
    });
    if (!created.ok) throw created.error;
    expect(created.value.exchangeRate.toNumber()).toBe(36.12345678);

    const updated = await buildUpdateUseCase().execute({
      householdId: household.householdId,
      transactionId: created.value.id,
      concept: 'Concepto editado, mismo importe',
    });

    expect(updated.ok).toBe(true);
    if (updated.ok) expect(updated.value.exchangeRate.toNumber()).toBe(36.12345678);
  });

  it('UpdateTransactionUseCase: re-deriva la quincena si cambia la fecha, contra Postgres real', async () => {
    const created = await buildRegisterUseCase().execute(baseCommand()); // marzo
    if (!created.ok) throw created.error;

    const updated = await buildUpdateUseCase().execute({
      householdId: household.householdId,
      transactionId: created.value.id,
      date: date('2026-07-20'),
    });

    expect(updated.ok).toBe(true);
    if (updated.ok) expect(updated.value.periodId).toBe(periodIds[14]); // Q2 de julio
  });
});
