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

import { DeleteTransactionUseCase } from './delete-transaction.use-case';
import { ListTransactionsUseCase } from './list-transactions.use-case';
import { RegisterTransactionUseCase, type RegisterTransactionCommand } from './register-transaction.use-case';
import { UpdateTransactionUseCase } from './update-transaction.use-case';

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

describe('UpdateTransactionUseCase / DeleteTransactionUseCase / ListTransactionsUseCase', () => {
  let categories: InMemoryCategoryRepository;
  let paymentMethods: InMemoryPaymentMethodRepository;
  let savingsFunds: InMemorySavingsFundRepository;
  let recurringExpenses: InMemoryRecurringExpenseRepository;
  let periods: InMemoryPeriodRepository;
  let households: InMemoryHouseholdRepository;
  let transactions: InMemoryTransactionRepository;
  let exchangeRates: InMemoryExchangeRateProvider;
  let register: RegisterTransactionUseCase;
  let update: UpdateTransactionUseCase;
  let del: DeleteTransactionUseCase;
  let list: ListTransactionsUseCase;

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
    categories = new InMemoryCategoryRepository();
    paymentMethods = new InMemoryPaymentMethodRepository();
    savingsFunds = new InMemorySavingsFundRepository();
    recurringExpenses = new InMemoryRecurringExpenseRepository();
    periods = new InMemoryPeriodRepository();
    households = new InMemoryHouseholdRepository();
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

    const clock = FixedClock.atISO('2026-03-10T18:00:00Z');
    register = new RegisterTransactionUseCase(
      transactions,
      households,
      categories,
      paymentMethods,
      recurringExpenses,
      savingsFunds,
      periods,
      exchangeRates,
      new SequentialIdGenerator(),
      clock
    );
    update = new UpdateTransactionUseCase(
      transactions,
      households,
      categories,
      paymentMethods,
      recurringExpenses,
      savingsFunds,
      periods,
      exchangeRates,
      clock
    );
    del = new DeleteTransactionUseCase(transactions);
    list = new ListTransactionsUseCase(transactions);
  });

  describe('UpdateTransactionUseCase', () => {
    it('actualiza el importe y emite transaction.updated', async () => {
      const created = await register.execute(baseCommand);
      if (!created.ok) throw created.error;

      const result = await update.execute({
        householdId: HOUSEHOLD,
        transactionId: created.value.id,
        amount: c('650'),
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.amount.toFixed()).toBe('650.00');
        const events = result.value.pullEvents();
        expect(events[0]!.name).toBe('transaction.updated');
      }
    });

    it('no permite tocar createdByUserId (RN-45): el comando ni lo admite', async () => {
      const created = await register.execute(baseCommand);
      if (!created.ok) throw created.error;

      const result = await update.execute({
        householdId: HOUSEHOLD,
        transactionId: created.value.id,
        concept: 'Supermercado (editado)',
      });

      expect(result.ok && result.value.createdByUserId).toBe(USER);
    });

    it('RN-38: no recalcula la tasa si no cambian fecha ni moneda', async () => {
      const rate1 = ExchangeRate.of({ base: NIO, quote: USD, date: date('2026-03-01'), rate: '36.00' });
      if (!rate1.ok) throw rate1.error;
      exchangeRates.add(rate1.value);

      const created = await register.execute({ ...baseCommand, amount: Money.unsafe('100', USD) });
      if (!created.ok) throw created.error;
      expect(created.value.exchangeRate.toNumber()).toBe(36);

      // Una tasa nueva que NO debería aplicarse, porque ni la fecha ni la
      // moneda del movimiento cambian en esta edición.
      const rate2 = ExchangeRate.of({ base: NIO, quote: USD, date: date('2026-03-10'), rate: '40.00' });
      if (!rate2.ok) throw rate2.error;
      exchangeRates.add(rate2.value);

      const result = await update.execute({
        householdId: HOUSEHOLD,
        transactionId: created.value.id,
        concept: 'Cambio de concepto solamente',
      });

      expect(result.ok && result.value.exchangeRate.toNumber()).toBe(36);
    });

    it('RN-38: sí recalcula si cambia la fecha', async () => {
      const rate1 = ExchangeRate.of({ base: NIO, quote: USD, date: date('2026-03-01'), rate: '36.00' });
      if (!rate1.ok) throw rate1.error;
      exchangeRates.add(rate1.value);
      const rate2 = ExchangeRate.of({ base: NIO, quote: USD, date: date('2026-06-01'), rate: '40.00' });
      if (!rate2.ok) throw rate2.error;
      exchangeRates.add(rate2.value);

      const created = await register.execute({ ...baseCommand, amount: Money.unsafe('100', USD) });
      if (!created.ok) throw created.error;

      const result = await update.execute({
        householdId: HOUSEHOLD,
        transactionId: created.value.id,
        date: date('2026-06-10'),
      });

      expect(result.ok && result.value.exchangeRate.toNumber()).toBe(40);
    });

    it('re-deriva la quincena si cambia la fecha', async () => {
      const created = await register.execute(baseCommand); // marzo → period-5
      if (!created.ok) throw created.error;

      const result = await update.execute({
        householdId: HOUSEHOLD,
        transactionId: created.value.id,
        date: date('2026-07-20'), // Q2 de julio
      });

      expect(result.ok && result.value.periodId).toBe('period-14');
    });

    it('editar un retiro de ahorro no lo compara contra sí mismo (caso borde)', async () => {
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

      const deposit = await register.execute({
        ...baseCommand,
        type: 'AHORRO',
        savingsFundId: 'fund-1',
        amount: c('1500'),
      });
      if (!deposit.ok) throw deposit.error;

      const withdrawal = await register.execute({
        ...baseCommand,
        type: 'RETIRO_AHORRO',
        savingsFundId: 'fund-1',
        amount: c('1000'),
      });
      if (!withdrawal.ok) throw withdrawal.error;

      // Saldo actual: 1500 − 1000 = 500. Sin devolverle su propio importe al
      // saldo antes de comprobar, subir este retiro a 1400 fallaría (1400 > 500)
      // aunque 1400 sí cabe en el saldo real disponible (1500).
      const result = await update.execute({
        householdId: HOUSEHOLD,
        transactionId: withdrawal.value.id,
        amount: c('1400'),
      });

      expect(result.ok).toBe(true);
    });

    it('devuelve NotFoundError si el movimiento no existe', async () => {
      const result = await update.execute({ householdId: HOUSEHOLD, transactionId: 'no-existe' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
    });
  });

  describe('DeleteTransactionUseCase', () => {
    it('borra un movimiento existente', async () => {
      const created = await register.execute(baseCommand);
      if (!created.ok) throw created.error;

      const result = await del.execute({ householdId: HOUSEHOLD, transactionId: created.value.id });
      expect(result.ok).toBe(true);
      expect(await transactions.findById(HOUSEHOLD, created.value.id)).toBeNull();
    });

    it('devuelve NotFoundError si ya no existe', async () => {
      const result = await del.execute({ householdId: HOUSEHOLD, transactionId: 'no-existe' });
      expect(result.ok).toBe(false);
    });
  });

  describe('ListTransactionsUseCase', () => {
    it('filtra por quincena y ordena por fecha descendente', async () => {
      await register.execute({ ...baseCommand, date: date('2026-03-05'), concept: 'A' });
      await register.execute({ ...baseCommand, date: date('2026-03-12'), concept: 'B' });
      await register.execute({ ...baseCommand, date: date('2026-07-01'), concept: 'C' });

      const marchOnly = await list.execute({ householdId: HOUSEHOLD, periodId: 'period-5' });
      expect(marchOnly.map((t) => t.concept)).toEqual(['B', 'A']);

      const all = await list.execute({ householdId: HOUSEHOLD });
      expect(all).toHaveLength(3);
    });
  });
});
