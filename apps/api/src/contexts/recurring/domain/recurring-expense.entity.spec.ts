import { describe, expect, it } from 'vitest';

import { CalendarDate } from '../../../shared/domain/calendar-date.vo';
import { Currency } from '../../../shared/domain/currency.vo';
import { Money } from '../../../shared/domain/money.vo';
import { PeriodFactory } from '../../budget/domain/period-factory.service';
import type { PeriodHalf } from '../../budget/domain/period.entity';

import { DueDay } from './due-day.vo';
import { FixedExpenseReconciler } from './fixed-expense-reconciler.service';
import { RecurringExpense, type Frequency, type PeriodRef } from './recurring-expense.entity';

const NIO = Currency.NIO;
const c = (amount: string | number): Money => Money.unsafe(amount, NIO);
const date = (iso: string): CalendarDate => {
  const result = CalendarDate.fromISO(iso);
  if (!result.ok) throw result.error;
  return result.value;
};

function period(year: number, month: number, half: PeriodHalf): PeriodRef {
  return {
    year,
    month,
    half,
    endDate:
      half === 'Q1'
        ? CalendarDate.unsafe(year, month, 15)
        : CalendarDate.unsafe(year, month, CalendarDate.lastDayOfMonth(year, month)),
  };
}

function expense(overrides: Partial<{
  amount: Money;
  dueDay: number;
  frequency: Frequency;
  isActive: boolean;
  startDate: CalendarDate | null;
  endDate: CalendarDate | null;
}> = {}): RecurringExpense {
  return new RecurringExpense({
    id: 'exp-1',
    householdId: 'hh-1',
    code: 'F01',
    categoryId: 'cat-1',
    concept: 'Apoyo Casa',
    amount: overrides.amount ?? c('2500'),
    dueDay: DueDay.unsafe(overrides.dueDay ?? 5),
    frequency: overrides.frequency ?? 'QUINCENAL',
    paymentMethodId: 'pm-1',
    isActive: overrides.isActive ?? true,
    notes: null,
    startDate: overrides.startDate ?? null,
    endDate: overrides.endDate ?? null,
  });
}

describe('DueDay', () => {
  it('acepta 1..31, incluidos días que no existen en todos los meses', () => {
    expect(DueDay.of(1).ok).toBe(true);
    expect(DueDay.of(31).ok).toBe(true);
  });

  it('rechaza fuera de rango y no enteros', () => {
    expect(DueDay.of(0).ok).toBe(false);
    expect(DueDay.of(32).ok).toBe(false);
    expect(DueDay.of(15.5).ok).toBe(false);
  });
});

describe('RecurringExpense — appliesTo derivado (RN-18)', () => {
  it('un fijo quincenal aplica a AMBAS, sea cual sea el día', () => {
    expect(expense({ frequency: 'QUINCENAL', dueDay: 1 }).appliesTo).toBe('AMBAS');
    expect(expense({ frequency: 'QUINCENAL', dueDay: 28 }).appliesTo).toBe('AMBAS');
  });

  it('un fijo mensual cae en la mitad que marca su día de pago', () => {
    expect(expense({ frequency: 'MENSUAL', dueDay: 1 }).appliesTo).toBe('Q1');
    expect(expense({ frequency: 'MENSUAL', dueDay: 15 }).appliesTo).toBe('Q1'); // borde
    expect(expense({ frequency: 'MENSUAL', dueDay: 16 }).appliesTo).toBe('Q2'); // borde
    expect(expense({ frequency: 'MENSUAL', dueDay: 31 }).appliesTo).toBe('Q2');
  });

  it('reproduce los 5 fijos precargados del Excel', () => {
    expect(expense({ frequency: 'QUINCENAL', dueDay: 5 }).appliesTo).toBe('AMBAS'); // F01
    expect(expense({ frequency: 'QUINCENAL', dueDay: 1 }).appliesTo).toBe('AMBAS'); // F02
    expect(expense({ frequency: 'QUINCENAL', dueDay: 18 }).appliesTo).toBe('AMBAS'); // F03
    expect(expense({ frequency: 'QUINCENAL', dueDay: 12 }).appliesTo).toBe('AMBAS'); // F04
    expect(expense({ frequency: 'MENSUAL', dueDay: 28 }).appliesTo).toBe('Q2'); // F05
  });
});

describe('RecurringExpense — costos (RN-19)', () => {
  it('un fijo quincenal cuesta el doble al mes', () => {
    const fixed = expense({ frequency: 'QUINCENAL', amount: c('2500') });
    expect(fixed.monthlyCost.toFixed()).toBe('5000.00');
    expect(fixed.annualCost.toFixed()).toBe('60000.00');
  });

  it('un fijo mensual cuesta su importe', () => {
    const fixed = expense({ frequency: 'MENSUAL', amount: c('700'), dueDay: 28 });
    expect(fixed.monthlyCost.toFixed()).toBe('700.00');
    expect(fixed.annualCost.toFixed()).toBe('8400.00');
  });

  it('un fijo inactivo cuesta cero', () => {
    const fixed = expense({ frequency: 'QUINCENAL', amount: c('2500'), isActive: false });
    expect(fixed.monthlyCost.toFixed()).toBe('0.00');
    expect(fixed.annualCost.toFixed()).toBe('0.00');
  });

  it('los 5 fijos del Excel suman C$ 12 100/mes y C$ 145 200/año', () => {
    const fixtures: Array<[Frequency, string, number]> = [
      ['QUINCENAL', '2500', 5],
      ['QUINCENAL', '2400', 1],
      ['QUINCENAL', '400', 18],
      ['QUINCENAL', '400', 12],
      ['MENSUAL', '700', 28],
    ];

    const monthly = fixtures.reduce(
      (total, [frequency, amount, dueDay]) =>
        total.plus(expense({ frequency, amount: c(amount), dueDay }).monthlyCost),
      Money.zero(NIO)
    );

    expect(monthly.toFixed()).toBe('12100.00');
    expect(monthly.times(12).toFixed()).toBe('145200.00');
  });
});

describe('RecurringExpense — fecha límite (RN-21)', () => {
  it('un fijo quincenal vence al cierre de la quincena', () => {
    const fixed = expense({ frequency: 'QUINCENAL', dueDay: 5 });
    expect(fixed.dueDateIn(period(2026, 2, 'Q2')).toISO()).toBe('2026-02-28');
    expect(fixed.dueDateIn(period(2026, 3, 'Q1')).toISO()).toBe('2026-03-15');
  });

  it('recorta dueDay = 31 al último día de febrero en vez de reventar', () => {
    const fixed = expense({ frequency: 'MENSUAL', dueDay: 31 });
    expect(fixed.dueDateIn(period(2026, 2, 'Q2')).toISO()).toBe('2026-02-28');
    expect(fixed.dueDateIn(period(2024, 2, 'Q2')).toISO()).toBe('2024-02-29'); // bisiesto
  });

  it('recorta dueDay = 31 a 30 en los meses de 30 días', () => {
    const fixed = expense({ frequency: 'MENSUAL', dueDay: 31 });
    expect(fixed.dueDateIn(period(2026, 4, 'Q2')).toISO()).toBe('2026-04-30');
    expect(fixed.dueDateIn(period(2026, 1, 'Q2')).toISO()).toBe('2026-01-31');
  });

  it('recorta al día 15 dentro de una Q1', () => {
    expect(
      expense({ frequency: 'MENSUAL', dueDay: 20 }).dueDateIn(period(2026, 5, 'Q1')).toISO()
    ).toBe('2026-05-15');
    expect(
      expense({ frequency: 'MENSUAL', dueDay: 10 }).dueDateIn(period(2026, 5, 'Q1')).toISO()
    ).toBe('2026-05-10');
  });

  it('la fecha límite nunca se sale del mes de la quincena', () => {
    for (const month of [1, 2, 4, 12]) {
      for (const half of ['Q1', 'Q2'] as const) {
        for (const dueDay of [1, 15, 16, 28, 29, 30, 31]) {
          const due = expense({ frequency: 'MENSUAL', dueDay }).dueDateIn(period(2026, month, half));
          expect(due.month).toBe(month);
          expect(due.year).toBe(2026);
        }
      }
    }
  });
});

describe('RecurringExpense — vigencia y cadencia', () => {
  it('un fijo inactivo no aplica a ninguna quincena', () => {
    expect(expense({ isActive: false }).appliesToPeriod(period(2026, 6, 'Q1'))).toBe(false);
  });

  it('un fijo dado de baja a mitad de año no aplica después (caso borde del plan)', () => {
    const fixed = expense({ endDate: date('2026-06-30') });
    expect(fixed.appliesToPeriod(period(2026, 6, 'Q2'))).toBe(true);
    expect(fixed.appliesToPeriod(period(2026, 7, 'Q1'))).toBe(false);
    expect(fixed.appliesToPeriod(period(2026, 12, 'Q2'))).toBe(false);
  });

  it('un fijo que empieza a mitad de año no aplica antes', () => {
    const fixed = expense({ startDate: date('2026-07-01') });
    expect(fixed.appliesToPeriod(period(2026, 6, 'Q2'))).toBe(false);
    expect(fixed.appliesToPeriod(period(2026, 7, 'Q1'))).toBe(true);
  });

  it('un fijo mensual solo aplica a su mitad', () => {
    const fixed = expense({ frequency: 'MENSUAL', dueDay: 28 });
    expect(fixed.appliesToPeriod(period(2026, 3, 'Q1'))).toBe(false);
    expect(fixed.appliesToPeriod(period(2026, 3, 'Q2'))).toBe(true);
  });

  it('un fijo bimestral no se cobra todos los meses', () => {
    const fixed = expense({ frequency: 'BIMESTRAL', dueDay: 10, startDate: date('2026-01-01') });
    expect(fixed.occursInMonth(1)).toBe(true);
    expect(fixed.occursInMonth(2)).toBe(false);
    expect(fixed.occursInMonth(3)).toBe(true);
  });

  it('un fijo anual solo se cobra en su mes', () => {
    const fixed = expense({ frequency: 'ANUAL', dueDay: 10, startDate: date('2026-03-01') });
    expect(fixed.occursInMonth(3)).toBe(true);
    expect(fixed.occursInMonth(4)).toBe(false);
    expect(fixed.occursInMonth(9)).toBe(false);
  });
});

describe('FixedExpenseReconciler — cascada (RN-22, RN-23)', () => {
  const base = {
    period: period(2026, 3, 'Q1'),
    today: date('2026-03-10'),
    tolerance: c('1'),
    dueSoonDays: 3,
  };

  it('NO_APLICA cuando el fijo no corresponde a la quincena', () => {
    const result = FixedExpenseReconciler.reconcile({
      ...base,
      expense: expense({ frequency: 'MENSUAL', dueDay: 28 }), // aplica a Q2
      registered: Money.zero(NIO),
      budgeted: Money.zero(NIO),
    });
    expect(result.status).toBe('NO_APLICA');
  });

  it('PAGADO cuando la diferencia está dentro de la tolerancia', () => {
    const result = FixedExpenseReconciler.reconcile({
      ...base,
      expense: expense(),
      registered: c('2500.50'),
      budgeted: c('2500'),
    });
    expect(result.status).toBe('PAGADO');
  });

  it('PAGADO_MONTO_DISTINTO cuando la diferencia alcanza la tolerancia', () => {
    const result = FixedExpenseReconciler.reconcile({
      ...base,
      expense: expense(),
      registered: c('2501'),
      budgeted: c('2500'),
    });
    expect(result.status).toBe('PAGADO_MONTO_DISTINTO');
    expect(result.difference.toFixed()).toBe('1.00');
  });

  it('la tolerancia es configurable (RN-23)', () => {
    const args = { ...base, expense: expense(), registered: c('2505'), budgeted: c('2500') };
    expect(FixedExpenseReconciler.reconcile({ ...args, tolerance: c('1') }).status).toBe(
      'PAGADO_MONTO_DISTINTO'
    );
    expect(FixedExpenseReconciler.reconcile({ ...args, tolerance: c('10') }).status).toBe('PAGADO');
  });

  it('un pago tardío sigue contando como pagado, no como vencido', () => {
    const result = FixedExpenseReconciler.reconcile({
      ...base,
      today: date('2026-03-20'), // ya pasó el cierre de la Q1
      expense: expense(),
      registered: c('2500'),
      budgeted: c('2500'),
    });
    expect(result.status).toBe('PAGADO');
  });

  it('VENCIDO cuando pasó la fecha límite sin registrar', () => {
    const result = FixedExpenseReconciler.reconcile({
      ...base,
      today: date('2026-03-16'),
      expense: expense(),
      registered: Money.zero(NIO),
      budgeted: c('2500'),
    });
    expect(result.status).toBe('VENCIDO');
  });

  it('POR_VENCER dentro de los días de aviso, incluido el propio límite', () => {
    const args = {
      ...base,
      expense: expense(),
      registered: Money.zero(NIO),
      budgeted: c('2500'),
    };
    // Límite: 2026-03-15 (cierre de la Q1)
    expect(FixedExpenseReconciler.reconcile({ ...args, today: date('2026-03-12') }).status).toBe(
      'POR_VENCER'
    );
    expect(FixedExpenseReconciler.reconcile({ ...args, today: date('2026-03-15') }).status).toBe(
      'POR_VENCER'
    );
  });

  it('PENDIENTE cuando aún hay margen', () => {
    const result = FixedExpenseReconciler.reconcile({
      ...base,
      today: date('2026-03-01'),
      expense: expense(),
      registered: Money.zero(NIO),
      budgeted: c('2500'),
    });
    expect(result.status).toBe('PENDIENTE');
    expect(result.daysUntilDue).toBe(14);
  });
});

describe('FixedExpenseReconciler — olvidados (RN-24, RN-35)', () => {
  const args = {
    expense: expense(),
    period: period(2026, 1, 'Q1'),
    registered: Money.zero(NIO),
    today: date('2026-06-01'),
  };

  it('es olvidado si la quincena cerró sin registro y está dentro del control', () => {
    expect(
      FixedExpenseReconciler.isForgotten({ ...args, controlStartDate: date('2026-01-01') })
    ).toBe(true);
  });

  it('NO es olvidado si la quincena cerró antes de controlStartDate (RN-35)', () => {
    // Es el caso que inunda de falsos "olvidaste pagar" a un usuario nuevo.
    expect(
      FixedExpenseReconciler.isForgotten({ ...args, controlStartDate: date('2026-03-01') })
    ).toBe(false);
  });

  it('NO es olvidado si la quincena aún no ha cerrado', () => {
    expect(
      FixedExpenseReconciler.isForgotten({
        ...args,
        today: date('2026-01-10'),
        controlStartDate: date('2026-01-01'),
      })
    ).toBe(false);
  });

  it('NO es olvidado si hay movimiento registrado', () => {
    expect(
      FixedExpenseReconciler.isForgotten({
        ...args,
        registered: c('2500'),
        controlStartDate: date('2026-01-01'),
      })
    ).toBe(false);
  });

  it('NO es olvidado si el fijo ya estaba de baja en esa quincena', () => {
    expect(
      FixedExpenseReconciler.isForgotten({
        ...args,
        expense: expense({ isActive: false }),
        controlStartDate: date('2026-01-01'),
      })
    ).toBe(false);
  });
});

describe('PeriodFactory — calendario (RN-01, RN-02)', () => {
  const periods = PeriodFactory.buildYear(2026);

  it('genera 24 quincenas numeradas de 1 a 24', () => {
    expect(periods).toHaveLength(24);
    expect(periods.map((p) => p.number)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
  });

  it('Q2 termina el último día real del mes', () => {
    const q2 = (month: number) => periods.find((p) => p.month === month && p.half === 'Q2')!;
    expect(q2(1).endDate.toISO()).toBe('2026-01-31');
    expect(q2(2).endDate.toISO()).toBe('2026-02-28');
    expect(q2(4).endDate.toISO()).toBe('2026-04-30');
    expect(PeriodFactory.buildYear(2024).find((p) => p.month === 2 && p.half === 'Q2')!.endDate.toISO())
      .toBe('2024-02-29');
  });

  it('cubre el año sin huecos ni solapamientos', () => {
    for (let i = 1; i < periods.length; i += 1) {
      expect(periods[i]!.startDate.toISO()).toBe(periods[i - 1]!.endDate.addDays(1).toISO());
    }
    const days = periods.reduce((t, p) => t + p.startDate.daysUntil(p.endDate) + 1, 0);
    expect(days).toBe(365);
    expect(
      PeriodFactory.buildYear(2024).reduce((t, p) => t + p.startDate.daysUntil(p.endDate) + 1, 0)
    ).toBe(366);
  });

  it('numberForDate resuelve la quincena de una fecha (RN-03)', () => {
    expect(PeriodFactory.numberForDate(date('2026-01-01'), 2026)).toBe(1);
    expect(PeriodFactory.numberForDate(date('2026-01-15'), 2026)).toBe(1);
    expect(PeriodFactory.numberForDate(date('2026-01-16'), 2026)).toBe(2);
    expect(PeriodFactory.numberForDate(date('2026-12-31'), 2026)).toBe(24);
  });

  it('numberForDate devuelve null fuera del año configurado (RN-03)', () => {
    expect(PeriodFactory.numberForDate(date('2025-12-31'), 2026)).toBeNull();
    expect(PeriodFactory.numberForDate(date('2027-01-01'), 2026)).toBeNull();
  });

  it('decompose invierte numberFor', () => {
    for (const p of periods) {
      const decomposed = PeriodFactory.decompose(p.number);
      expect(decomposed.ok && decomposed.value).toEqual({ month: p.month, half: p.half });
    }
    expect(PeriodFactory.decompose(0).ok).toBe(false);
    expect(PeriodFactory.decompose(25).ok).toBe(false);
  });
});
