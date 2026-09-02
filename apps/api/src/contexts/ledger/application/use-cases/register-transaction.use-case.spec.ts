import { beforeEach, describe, expect, it } from 'vitest';

import { CalendarDate } from '../../../../shared/domain/calendar-date.vo';
import { FixedClock } from '../../../../shared/infrastructure/clock/system-clock.adapter';
import { Currency } from '../../../../shared/domain/currency.vo';
import { ExchangeRate } from '../../../../shared/domain/exchange-rate.vo';
import { Money } from '../../../../shared/domain/money.vo';
import { InMemoryCategoryRepository, InMemoryPaymentMethodRepository, InMemorySavingsFundRepository } from '../../../../../test/doubles/catalog.doubles';
import { InMemoryPeriodRepository } from '../../../../../test/doubles/budget.doubles';
import { InMemoryHouseholdRepository } from '../../../../../test/doubles/iam.doubles';
import { InMemoryRecurringExpenseRepository } from '../../../../../test/doubles/recurring.doubles';
import { InMemoryTransactionRepository } from '../../../../../test/doubles/ledger.doubles';
import { InMemoryExchangeRateProvider } from '../../../../../test/doubles/exchange-rate.double';
import { SequentialIdGenerator } from '../../../../../test/doubles/id-generator.double';
import { Category } from '../../../catalog/domain/category.entity';
import { SavingsFund } from '../../../catalog/domain/savings-fund.entity';
import { Period } from '../../../budget/domain/period.entity';
import { PeriodFactory } from '../../../budget/domain/period-factory.service';
import { Household } from '../../../iam/domain/household.entity';
import { DueDay } from '../../../recurring/domain/due-day.vo';
import { RecurringExpense } from '../../../recurring/domain/recurring-expense.entity';

import { RegisterTransactionUseCase, type RegisterTransactionCommand } from './register-transaction.use-case';

const HOUSEHOLD = 'hh-1';
const USER = 'user-1';
const NIO = Currency.NIO;
const USD = Currency.USD;
const c = (amount: string): Money => Money.unsafe(amount, NIO);
const date = (iso: string): CalendarDate => {
  const result = CalendarDate.fromISO(iso);
  if (!result.ok) throw result.error;
  return result.value;
};

describe('RegisterTransactionUseCase', () => {
  let households: InMemoryHouseholdRepository;
  let categories: InMemoryCategoryRepository;
  let paymentMethods: InMemoryPaymentMethodRepository;
  let recurringExpenses: InMemoryRecurringExpenseRepository;
  let savingsFunds: InMemorySavingsFundRepository;
  let periods: InMemoryPeriodRepository;
  let transactions: InMemoryTransactionRepository;
  let exchangeRates: InMemoryExchangeRateProvider;
  let useCase: RegisterTransactionUseCase;

  const baseCommand: RegisterTransactionCommand = {
    householdId: HOUSEHOLD,
    createdByUserId: USER,
    date: date('2026-03-10'),
    type: 'VARIABLE',
    categoryId: 'cat-1',
    concept: 'Supermercado',
    amount: c('500'),
    status: 'PAGADO',
  };

  beforeEach(async () => {
    households = new InMemoryHouseholdRepository();
    categories = new InMemoryCategoryRepository();
    paymentMethods = new InMemoryPaymentMethodRepository();
    recurringExpenses = new InMemoryRecurringExpenseRepository();
    savingsFunds = new InMemorySavingsFundRepository();
    periods = new InMemoryPeriodRepository();
    transactions = new InMemoryTransactionRepository(NIO);
    exchangeRates = new InMemoryExchangeRateProvider();

    await households.save(
      new Household({ id: HOUSEHOLD, name: 'Hogar', baseCurrency: NIO, timezone: 'America/Managua' })
    );
    await categories.save(
      new Category({
        id: 'cat-1',
        householdId: HOUSEHOLD,
        name: 'Supermercado',
        kind: 'VARIABLE',
        color: null,
        icon: null,
        isSystem: true,
        isActive: true,
        sortOrder: 0,
      })
    );
    await periods.saveMany(
      PeriodFactory.buildYear(2026).map(
        (b, i) =>
          new Period({
            id: `period-${i + 1}`,
            householdId: HOUSEHOLD,
            year: 2026,
            number: b.number,
            month: b.month,
            half: b.half,
            startDate: b.startDate,
            endDate: b.endDate,
            plannedIncome: c('8500'),
            plannedIncomeCurrency: NIO,
          })
      )
    );

    useCase = new RegisterTransactionUseCase(
      transactions,
      households,
      categories,
      paymentMethods,
      recurringExpenses,
      savingsFunds,
      periods,
      exchangeRates,
      new SequentialIdGenerator(),
      FixedClock.atISO('2026-03-10T18:00:00Z')
    );
  });

  it('registra un movimiento válido y deriva la quincena (RN-29)', async () => {
    const result = await useCase.execute(baseCommand);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.periodId).toBe('period-5'); // Q1 de marzo = quincena 5
      expect(result.value.baseAmount.toFixed()).toBe('500.00');
      expect(result.value.exchangeRate.toNumber()).toBe(1);
    }
  });

  it('emite el evento transaction.registered', async () => {
    const result = await useCase.execute(baseCommand);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const events = result.value.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]!.name).toBe('transaction.registered');
    }
  });

  it('rechaza un household inexistente', async () => {
    const result = await useCase.execute({ ...baseCommand, householdId: 'no-existe' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('rechaza una categoría inexistente', async () => {
    const result = await useCase.execute({ ...baseCommand, categoryId: 'no-existe' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });

  it('rechaza una fecha fuera de cualquier año configurado (RN-03)', async () => {
    const result = await useCase.execute({ ...baseCommand, date: date('2030-01-01') });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.details.rule).toBe('RN-29');
  });

  it('rechaza un FIJO sin gasto fijo existente (RN-26)', async () => {
    const result = await useCase.execute({
      ...baseCommand,
      type: 'FIJO',
      recurringExpenseId: 'no-existe',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.details.rule).toBe('RN-26');
  });

  it('acepta un FIJO bien referenciado', async () => {
    await recurringExpenses.save(
      new RecurringExpense({
        id: 'exp-1',
        householdId: HOUSEHOLD,
        code: 'F01',
        categoryId: 'cat-1',
        concept: 'Apoyo Casa',
        amount: c('2500'),
        dueDay: DueDay.unsafe(5),
        frequency: 'QUINCENAL',
        paymentMethodId: null,
        isActive: true,
        notes: null,
        startDate: null,
        endDate: null,
      })
    );

    const result = await useCase.execute({
      ...baseCommand,
      type: 'FIJO',
      recurringExpenseId: 'exp-1',
      amount: c('2500'),
    });
    expect(result.ok).toBe(true);
  });

  it('rechaza AHORRO sin fondo (RN-39)', async () => {
    const result = await useCase.execute({ ...baseCommand, type: 'AHORRO' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.details.rule).toBe('RN-39');
  });

  it('rechaza RETIRO_AHORRO mayor que el saldo del fondo (RN-41)', async () => {
    await savingsFunds.save(
      new SavingsFund({
        id: 'fund-1',
        householdId: HOUSEHOLD,
        name: 'Fondo general',
        currency: NIO,
        targetAmount: null,
        targetDate: null,
        isDefault: true,
        isActive: true,
      })
    );

    // Saldo actual: 0 (sin aportes previos).
    const result = await useCase.execute({
      ...baseCommand,
      type: 'RETIRO_AHORRO',
      savingsFundId: 'fund-1',
      amount: c('100'),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.details.rule).toBe('RN-41');
  });

  it('acepta RETIRO_AHORRO hasta el saldo disponible', async () => {
    await savingsFunds.save(
      new SavingsFund({
        id: 'fund-1',
        householdId: HOUSEHOLD,
        name: 'Fondo general',
        currency: NIO,
        targetAmount: null,
        targetDate: null,
        isDefault: true,
        isActive: true,
      })
    );

    const deposit = await useCase.execute({
      ...baseCommand,
      type: 'AHORRO',
      savingsFundId: 'fund-1',
      amount: c('1500'),
    });
    expect(deposit.ok).toBe(true);

    const withdrawal = await useCase.execute({
      ...baseCommand,
      type: 'RETIRO_AHORRO',
      savingsFundId: 'fund-1',
      amount: c('1500'),
    });
    expect(withdrawal.ok).toBe(true);
  });

  describe('multimoneda (D4, RN-36, RN-37)', () => {
    it('convierte a la moneda base usando la tasa de la fecha del movimiento', async () => {
      const rate = ExchangeRate.of({ base: NIO, quote: USD, date: date('2026-03-01'), rate: '36.60' });
      if (!rate.ok) throw rate.error;
      exchangeRates.add(rate.value);

      const result = await useCase.execute({ ...baseCommand, amount: Money.unsafe('100', USD) });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.baseAmount.toFixed()).toBe('3660.00');
        expect(result.value.amount.toFixed()).toBe('100.00');
        expect(result.value.amount.currency.equals(USD)).toBe(true);
      }
    });

    it('rechaza un movimiento en moneda extranjera sin ninguna tasa (RN-37)', async () => {
      const result = await useCase.execute({ ...baseCommand, amount: Money.unsafe('100', USD) });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.details.rule).toBe('RN-37');
    });
  });
});
