import { describe, expect, it } from 'vitest';

import { CalendarDate } from '../../../shared/domain/calendar-date.vo';
import { Currency } from '../../../shared/domain/currency.vo';
import { Money } from '../../../shared/domain/money.vo';

import { SavingsFundBalanceCalculator } from './savings-fund-balance-calculator.service';
import { SavingsFund } from './savings-fund.entity';

const NIO = Currency.NIO;
const c = (amount: string | number): Money => Money.unsafe(amount, NIO);
const date = (iso: string): CalendarDate => {
  const result = CalendarDate.fromISO(iso);
  if (!result.ok) throw result.error;
  return result.value;
};

describe('SavingsFundBalanceCalculator — RN-40, RN-41b', () => {
  it('el saldo es aportes menos retiros', () => {
    const balance = SavingsFundBalanceCalculator.balance({
      contributions: c('5000'),
      withdrawals: c('1200'),
    });
    expect(balance.toFixed()).toBe('3800.00');
  });

  it('apartar 1 500 y retirar 1 400 es ahorrar 100, no 1 500 (RN-41b)', () => {
    // El caso borde que el plan exige explícitamente.
    const effective = SavingsFundBalanceCalculator.effectiveSavings({
      contributions: c('1500'),
      withdrawals: c('1400'),
    });
    expect(effective.toFixed()).toBe('100.00');
    expect(effective.toFixed()).not.toBe('1500.00');
  });

  it('un fondo sin movimientos tiene saldo cero', () => {
    expect(
      SavingsFundBalanceCalculator.balance(SavingsFundBalanceCalculator.emptyTotals(NIO)).toFixed()
    ).toBe('0.00');
  });
});

describe('SavingsFundBalanceCalculator — retiros (RN-41)', () => {
  it('rechaza un retiro mayor que el saldo', () => {
    const result = SavingsFundBalanceCalculator.validateWithdrawal({
      fundName: 'Fondo general',
      currentBalance: c('1000'),
      withdrawal: c('1500'),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('BUSINESS_RULE_VIOLATION');
      expect(result.error.details.rule).toBe('RN-41');
      expect(result.error.message).toContain('1000.00');
    }
  });

  it('acepta un retiro igual al saldo exacto y lo deja en cero', () => {
    const result = SavingsFundBalanceCalculator.validateWithdrawal({
      fundName: 'Fondo general',
      currentBalance: c('1000'),
      withdrawal: c('1000'),
    });
    expect(result.ok && result.value.toFixed()).toBe('0.00');
  });

  it('rechaza un retiro de importe cero o negativo', () => {
    expect(
      SavingsFundBalanceCalculator.validateWithdrawal({
        fundName: 'F',
        currentBalance: c('1000'),
        withdrawal: c('0'),
      }).ok
    ).toBe(false);
  });
});

describe('SavingsFund — progreso hacia la meta', () => {
  const fund = (targetAmount: Money | null): SavingsFund =>
    new SavingsFund({
      id: 'f1',
      householdId: 'hh1',
      name: 'Fondo general',
      currency: NIO,
      targetAmount,
      targetDate: date('2026-12-31'),
      isDefault: true,
      isActive: true,
    });

  it('calcula el porcentaje alcanzado', () => {
    expect(fund(c('10000')).progressToward(c('2500'))?.toNumber()).toBeCloseTo(0.25, 10);
  });

  it('sin meta no hay progreso que mostrar', () => {
    expect(fund(null).progressToward(c('2500'))).toBeNull();
    expect(fund(null).remainingToTarget(c('2500'))).toBeNull();
  });

  it('lo que falta nunca es negativo aunque se supere la meta', () => {
    expect(fund(c('10000')).remainingToTarget(c('12000'))?.toFixed()).toBe('0.00');
    expect(fund(c('10000')).progressToward(c('12000'))?.exceedsWhole).toBe(true);
  });
});
