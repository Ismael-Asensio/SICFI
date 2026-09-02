import { describe, expect, it } from 'vitest';

import { CalendarDate } from '../../../shared/domain/calendar-date.vo';
import { Currency } from '../../../shared/domain/currency.vo';
import { Money } from '../../../shared/domain/money.vo';

import type { TransactionProps } from './transaction.entity';
import { Transaction } from './transaction.entity';

const NIO = Currency.NIO;
const c = (amount: string): Money => Money.unsafe(amount, NIO);
const date = (iso: string): CalendarDate => {
  const result = CalendarDate.fromISO(iso);
  if (!result.ok) throw result.error;
  return result.value;
};

function props(overrides: Partial<TransactionProps> = {}): TransactionProps {
  return {
    id: 'tx-1',
    householdId: 'hh-1',
    date: date('2026-03-10'),
    periodId: 'period-5',
    type: 'VARIABLE',
    categoryId: 'cat-1',
    concept: 'Supermercado',
    recurringExpenseId: null,
    savingsFundId: null,
    amount: c('500'),
    exchangeRate: c('1').toDecimal(),
    baseAmount: c('500'),
    paymentMethodId: null,
    status: 'PAGADO',
    notes: null,
    createdByUserId: 'user-1',
    ...overrides,
  };
}

describe('Transaction — construcción', () => {
  it('register() deja un evento transaction.registered listo para publicarse', () => {
    const occurredAt = new Date('2026-03-10T18:00:00Z');
    const transaction = Transaction.register(props(), occurredAt);

    expect(transaction.hasPendingEvents).toBe(true);
    const events = transaction.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      name: 'transaction.registered',
      aggregateId: 'tx-1',
      householdId: 'hh-1',
      occurredAt,
    });
    expect(transaction.hasPendingEvents).toBe(false);
  });

  it('reconstitute() no emite ningún evento: ya ocurrió en el pasado', () => {
    const transaction = Transaction.reconstitute(props());
    expect(transaction.hasPendingEvents).toBe(false);
  });

  it('update() emite transaction.updated y respeta RN-45', () => {
    const original = Transaction.reconstitute(props());
    const occurredAt = new Date('2026-03-15T12:00:00Z');

    const updated = original.update({ amount: c('700'), baseAmount: c('700') }, occurredAt);

    expect(updated.amount.toFixed()).toBe('700.00');
    expect(updated.createdByUserId).toBe('user-1');
    const events = updated.pullEvents();
    expect(events[0]!.name).toBe('transaction.updated');
    expect(events[0]!.occurredAt).toBe(occurredAt);
  });

  it('update() no muta la instancia original', () => {
    const original = Transaction.reconstitute(props());
    original.update({ amount: c('700') }, new Date());
    expect(original.amount.toFixed()).toBe('500.00');
  });
});

describe('Transaction — clasificación derivada', () => {
  it('countsTowardSpending es falso solo para PROGRAMADO (RN-27)', () => {
    expect(Transaction.reconstitute(props({ status: 'PAGADO' })).countsTowardSpending).toBe(true);
    expect(Transaction.reconstitute(props({ status: 'PENDIENTE' })).countsTowardSpending).toBe(true);
    expect(Transaction.reconstitute(props({ status: 'PROGRAMADO' })).countsTowardSpending).toBe(false);
  });

  it('isRealSpend es cierto solo para FIJO y VARIABLE (RN-08, D3)', () => {
    expect(Transaction.reconstitute(props({ type: 'FIJO' })).isRealSpend).toBe(true);
    expect(Transaction.reconstitute(props({ type: 'VARIABLE' })).isRealSpend).toBe(true);
    expect(Transaction.reconstitute(props({ type: 'AHORRO' })).isRealSpend).toBe(false);
  });

  it('isInflow es cierto para INGRESO_EXTRA y RETIRO_AHORRO', () => {
    expect(Transaction.reconstitute(props({ type: 'INGRESO_EXTRA' })).isInflow).toBe(true);
    expect(Transaction.reconstitute(props({ type: 'RETIRO_AHORRO' })).isInflow).toBe(true);
    expect(Transaction.reconstitute(props({ type: 'VARIABLE' })).isInflow).toBe(false);
  });
});
