import { describe, expect, it } from 'vitest';

import { CalendarDate } from '../../../../shared/domain/calendar-date.vo';
import { Currency } from '../../../../shared/domain/currency.vo';
import { Money } from '../../../../shared/domain/money.vo';
import { Percentage } from '../../../../shared/domain/percentage.vo';
import {
  PeriodCalculator,
  type PeriodMovementTotals,
} from '../../../budget/domain/period-calculator.service';

import type { AlertContext } from './alert';
import { AlertEngine } from './alert-engine.service';
import { ALERT_RULES } from './rules';

const NIO = Currency.NIO;
const c = (amount: string | number): Money => Money.unsafe(amount, NIO);
const date = (iso: string): CalendarDate => {
  const result = CalendarDate.fromISO(iso);
  if (!result.ok) throw result.error;
  return result.value;
};

const engine = new AlertEngine();

function context(overrides: Partial<AlertContext> = {}): AlertContext {
  const totals: PeriodMovementTotals = {
    ...PeriodCalculator.emptyTotals(NIO),
    fixedPaid: c('3000'),
    variable: c('1000'),
  };

  const snapshot = PeriodCalculator.calculate({
    plannedIncome: c('8500'),
    budgetedFixed: c('6050'),
    totals,
    currency: NIO,
  });

  return {
    snapshot,
    currency: NIO,
    spendThreshold: Percentage.unsafe('0.80'),
    dueSoonDays: 3,
    inactivityDays: 5,
    savingGoal: Money.zero(NIO),
    today: date('2026-03-10'),
    controlStartDate: date('2026-01-01'),
    daysUntilPeriodClose: 5,
    lastMovementDate: date('2026-03-09'),
    overdueFixedCount: 0,
    dueSoonFixedCount: 0,
    pendingTransactionCount: 0,
    forgottenFixedCount: 0,
    incompleteTransactionCount: 0,
    ...overrides,
  };
}

/** Construye un contexto con un snapshot a medida. */
function withTotals(
  totals: Partial<PeriodMovementTotals>,
  overrides: Partial<AlertContext> = {},
  plannedIncome: Money | null = c('8500'),
  budgetedFixed: Money = c('6050')
): AlertContext {
  const snapshot = PeriodCalculator.calculate({
    plannedIncome,
    budgetedFixed,
    totals: { ...PeriodCalculator.emptyTotals(NIO), ...totals },
    currency: NIO,
  });
  return context({ snapshot, ...overrides });
}

const codes = (ctx: AlertContext, disabled: string[] = []): string[] =>
  engine.evaluate(ctx, disabled).map((alert) => alert.code);

describe('AlertEngine — catálogo', () => {
  it('registra 11 reglas evaluables más A12 como fallback', () => {
    expect(ALERT_RULES).toHaveLength(11);
    const registered = ALERT_RULES.map((rule) => rule.code);
    expect(new Set(registered).size).toBe(11);
    expect(registered).toEqual(
      expect.arrayContaining(['A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09', 'A10', 'A11'])
    );
  });
});

describe('AlertEngine — reglas individuales', () => {
  it('A01 cuando no hay ingreso planificado', () => {
    expect(codes(withTotals({}, {}, null, c('0')))).toContain('A01');
  });

  it('A02 cuando las salidas superan el disponible', () => {
    expect(codes(withTotals({ variable: c('9000') }))).toContain('A02');
  });

  it('A03 al alcanzar el umbral, sin sobregiro', () => {
    const result = codes(withTotals({ variable: c('6800') }, {}, c('8500'), c('0')));
    expect(result).toContain('A03');
    expect(result).not.toContain('A02');
  });

  it('A03 NO se dispara por apartar ahorro (RN-12, D3)', () => {
    // 40 % ejecutado pero 96 % comprometido: el ahorro no es sobregasto.
    const result = codes(
      withTotals({ variable: c('3400'), savingsSetAside: c('4800') }, {}, c('8500'), c('0'))
    );
    expect(result).not.toContain('A03');
  });

  it('A04 cuando el restante proyectado es negativo', () => {
    expect(codes(withTotals({ variable: c('4000') }))).toContain('A04');
  });

  it('A05 con fijos vencidos', () => {
    expect(codes(context({ overdueFixedCount: 2 }))).toContain('A05');
  });

  it('A06 con fijos por vencer', () => {
    expect(codes(context({ dueSoonFixedCount: 1 }))).toContain('A06');
  });

  it('A07 tras superar los días sin registrar', () => {
    expect(codes(context({ lastMovementDate: date('2026-03-01') }))).toContain('A07');
    expect(codes(context({ lastMovementDate: date('2026-03-08') }))).not.toContain('A07');
  });

  it('A07 también cuando no hay ningún movimiento', () => {
    expect(codes(context({ lastMovementDate: null }))).toContain('A07');
  });

  it('A08 con movimientos pendientes', () => {
    expect(codes(context({ pendingTransactionCount: 3 }))).toContain('A08');
  });

  it('A09 con fijos olvidados de quincenas cerradas', () => {
    expect(codes(context({ forgottenFixedCount: 2 }))).toContain('A09');
  });

  it('A10 con movimientos incompletos', () => {
    expect(codes(context({ incompleteTransactionCount: 1 }))).toContain('A10');
  });

  it('A12 cuando no hay nada que decir', () => {
    expect(codes(context())).toEqual(['A12']);
  });
});

describe('AlertEngine — A11 meta de ahorro (RN-41b)', () => {
  it('no aparece si no hay meta configurada', () => {
    expect(codes(context({ savingGoal: Money.zero(NIO) }))).not.toContain('A11');
  });

  it('marca la meta como cumplida en nivel OK', () => {
    const alerts = engine.evaluate(
      withTotals({ savingsSetAside: c('1500') }, { savingGoal: c('1500') })
    );
    const a11 = alerts.find((alert) => alert.code === 'A11');
    expect(a11?.level).toBe('OK');
  });

  it('apartar 1 500 y retirar 1 400 NO cumple una meta de 1 500', () => {
    // El caso borde de RN-41b: cuenta el ahorro efectivo, no el bruto.
    const alerts = engine.evaluate(
      withTotals(
        { savingsSetAside: c('1500'), savingsWithdrawn: c('1400') },
        { savingGoal: c('1500') }
      )
    );
    const a11 = alerts.find((alert) => alert.code === 'A11');
    expect(a11?.level).toBe('INFO');
    expect(a11?.message).toContain('1400.00'); // faltan 1 400
  });
});

describe('AlertEngine — orden por gravedad (RN-34)', () => {
  it('las URGENTE van antes que las AVISO', () => {
    const alerts = engine.evaluate(
      withTotals({ variable: c('9000') }, { overdueFixedCount: 1, pendingTransactionCount: 2 })
    );
    const levels = alerts.map((alert) => alert.level);
    const firstAviso = levels.indexOf('AVISO');
    const lastUrgente = levels.lastIndexOf('URGENTE');
    expect(lastUrgente).toBeLessThan(firstAviso);
  });

  it('mostSevere devuelve la más grave', () => {
    const alert = engine.mostSevere(
      withTotals({ variable: c('9000') }, { pendingTransactionCount: 2 })
    );
    expect(alert?.level).toBe('URGENTE');
  });

  it('el orden es estable a igual nivel', () => {
    const ctx = context({ overdueFixedCount: 1, dueSoonFixedCount: 1, pendingTransactionCount: 1 });
    expect(codes(ctx)).toEqual(codes(ctx));
  });
});

describe('AlertEngine — reglas desactivadas (RN-33)', () => {
  it('omite las que el usuario desactivó', () => {
    const ctx = context({ overdueFixedCount: 1, pendingTransactionCount: 1 });
    expect(codes(ctx)).toEqual(expect.arrayContaining(['A05', 'A08']));
    expect(codes(ctx, ['A05'])).not.toContain('A05');
    expect(codes(ctx, ['A05', 'A08'])).toEqual(['A12']);
  });
});

describe('AlertEngine — controlStartDate (RN-35)', () => {
  const before = context({
    today: date('2026-01-10'),
    controlStartDate: date('2026-06-01'),
    overdueFixedCount: 5,
    dueSoonFixedCount: 3,
    forgottenFixedCount: 10,
    lastMovementDate: null,
  });

  it('silencia las alertas con dependencia de fechas antes del inicio del control', () => {
    // Sin RN-35, un usuario nuevo recibiría A05, A06, A07 y A09 de golpe.
    const result = codes(before);
    expect(result).not.toContain('A05');
    expect(result).not.toContain('A06');
    expect(result).not.toContain('A07');
    expect(result).not.toContain('A09');
  });

  it('las que no dependen de fechas sí se evalúan', () => {
    const ctx = withTotals(
      { variable: c('9000') },
      { today: date('2026-01-10'), controlStartDate: date('2026-06-01'), overdueFixedCount: 5 }
    );
    const result = codes(ctx);
    expect(result).toContain('A02'); // sobregiro: no depende de fechas
    expect(result).not.toContain('A05');
  });

  it('a partir del inicio del control vuelven a evaluarse', () => {
    const result = codes(
      context({
        today: date('2026-06-02'),
        controlStartDate: date('2026-06-01'),
        overdueFixedCount: 5,
      })
    );
    expect(result).toContain('A05');
  });
});

describe('AlertEngine — extensibilidad', () => {
  it('acepta un conjunto de reglas propio sin tocar el motor', () => {
    const custom = new AlertEngine([
      {
        code: 'A99',
        level: 'INFO',
        dateDependent: false,
        evaluate: () => ({
          code: 'A99',
          level: 'INFO' as const,
          title: 'Regla de prueba',
          message: 'Añadir una alerta es añadir una clase.',
        }),
      },
    ]);

    expect(custom.evaluate(context()).map((a) => a.code)).toEqual(['A99']);
  });
});
