import { describe, expect, it } from 'vitest';

import { Currency } from '../../../shared/domain/currency.vo';
import { Money } from '../../../shared/domain/money.vo';
import { Percentage } from '../../../shared/domain/percentage.vo';

import {
  PeriodCalculator,
  type PeriodCalculationInput,
  type PeriodMovementTotals,
} from './period-calculator.service';
import { PeriodStatusResolver } from './period-status-resolver.service';

const NIO = Currency.NIO;
const c = (amount: string | number): Money => Money.unsafe(amount, NIO);
const THRESHOLD = Percentage.unsafe('0.80');

/** Quincena típica del usuario real: C$ 8 500 de ingreso, C$ 6 050 de fijos. */
function input(overrides: {
  plannedIncome?: Money | null;
  budgetedFixed?: Money;
  totals?: Partial<PeriodMovementTotals>;
} = {}): PeriodCalculationInput {
  return {
    plannedIncome: overrides.plannedIncome === undefined ? c('8500') : overrides.plannedIncome,
    budgetedFixed: overrides.budgetedFixed ?? c('6050'),
    totals: { ...PeriodCalculator.emptyTotals(NIO), ...overrides.totals },
    currency: NIO,
  };
}

describe('PeriodCalculator — disponible (RN-06)', () => {
  it('suma ingreso planificado, ingresos extra y retiros de ahorro', () => {
    const snapshot = PeriodCalculator.calculate(
      input({ totals: { extraIncome: c('1000'), savingsWithdrawn: c('500') } })
    );
    expect(snapshot.available.toFixed()).toBe('10000.00');
  });

  it('trata un ingreso no planificado como cero, no como error', () => {
    const snapshot = PeriodCalculator.calculate(input({ plannedIncome: null }));
    expect(snapshot.available.toFixed()).toBe('0.00');
  });
});

describe('PeriodCalculator — el ahorro NO es gasto (D3, RN-08)', () => {
  it('apartar ahorro no cuenta como gasto real', () => {
    const snapshot = PeriodCalculator.calculate(
      input({ totals: { fixedPaid: c('3000'), variable: c('1000'), savingsSetAside: c('1500') } })
    );

    expect(snapshot.realSpend.toFixed()).toBe('4000.00'); // fijos + variables, sin ahorro
    expect(snapshot.cashOutflow.toFixed()).toBe('5500.00'); // ahora sí con ahorro
  });

  it('apartar ahorro NO sube el %ejecutado ni dispara A03 (caso borde del plan)', () => {
    const sinAhorro = PeriodCalculator.calculate(
      input({ totals: { fixedPaid: c('6050'), variable: c('750') } })
    );
    const conAhorro = PeriodCalculator.calculate(
      input({ totals: { fixedPaid: c('6050'), variable: c('750'), savingsSetAside: c('1500') } })
    );

    // El % ejecutado es idéntico: el ahorro no es gasto.
    expect(sinAhorro.executedRatio.toNumber()).toBeCloseTo(0.8, 10);
    expect(conAhorro.executedRatio.toNumber()).toBeCloseTo(0.8, 10);

    // El % comprometido sí sube, porque el dinero salió del bolsillo.
    expect(conAhorro.committedRatio.toNumber()).toBeCloseTo(0.9764705882, 8);

    // Y el disponible restante baja en ambos casos de forma distinta.
    expect(sinAhorro.remainingAvailable.toFixed()).toBe('1700.00');
    expect(conAhorro.remainingAvailable.toFixed()).toBe('200.00');
  });

  it('un retiro de ahorro vuelve a caja y sube el disponible', () => {
    const snapshot = PeriodCalculator.calculate(
      input({ totals: { savingsWithdrawn: c('1400'), variable: c('1000') } })
    );
    expect(snapshot.available.toFixed()).toBe('9900.00');
    expect(snapshot.realSpend.toFixed()).toBe('1000.00');
  });
});

describe('PeriodCalculator — fijos pendientes (RN-09)', () => {
  it('resta lo pagado de lo presupuestado', () => {
    const snapshot = PeriodCalculator.calculate(input({ totals: { fixedPaid: c('2500') } }));
    expect(snapshot.pendingFixed.toFixed()).toBe('3550.00');
  });

  it('nunca es negativo aunque se pague de más', () => {
    const snapshot = PeriodCalculator.calculate(input({ totals: { fixedPaid: c('7000') } }));
    expect(snapshot.pendingFixed.toFixed()).toBe('0.00');
  });
});

describe('PeriodCalculator — restante proyectado (RN-10, RN-11)', () => {
  it('descuenta del disponible las salidas y los fijos que faltan', () => {
    const snapshot = PeriodCalculator.calculate(
      input({ totals: { fixedPaid: c('2500'), variable: c('1000') } })
    );

    expect(snapshot.remainingAvailable.toFixed()).toBe('5000.00'); // 8500 − 3500
    expect(snapshot.pendingFixed.toFixed()).toBe('3550.00'); // 6050 − 2500
    expect(snapshot.projectedRemaining.toFixed()).toBe('1450.00'); // 5000 − 3550
  });

  it('se vuelve negativo cuando no alcanza para los fijos pendientes', () => {
    const snapshot = PeriodCalculator.calculate(
      input({ totals: { fixedPaid: c('1000'), variable: c('4000') } })
    );
    expect(snapshot.projectedRemaining.isNegative()).toBe(true);
    expect(snapshot.projectedRemaining.toFixed()).toBe('-1550.00');
  });
});

describe('PeriodCalculator — porcentajes (RN-12, RN-12b)', () => {
  it('devuelve 0 cuando el disponible es 0, sin dividir por cero', () => {
    const snapshot = PeriodCalculator.calculate(
      input({ plannedIncome: null, totals: { variable: c('500') } })
    );

    expect(snapshot.available.isZero()).toBe(true);
    expect(snapshot.executedRatio.toNumber()).toBe(0);
    expect(snapshot.committedRatio.toNumber()).toBe(0);
    expect(snapshot.realSpend.toFixed()).toBe('500.00');
  });

  it('puede superar el 100 % cuando hay sobregasto', () => {
    const snapshot = PeriodCalculator.calculate(input({ totals: { variable: c('10200') } }));
    expect(snapshot.executedRatio.toNumber()).toBeCloseTo(1.2, 10);
    expect(snapshot.executedRatio.exceedsWhole).toBe(true);
  });
});

describe('PeriodCalculator — precisión decimal', () => {
  it('no arrastra error de coma flotante en una quincena de céntimos', () => {
    const snapshot = PeriodCalculator.calculate(
      input({
        plannedIncome: c('0.30'),
        budgetedFixed: c('0'),
        totals: { variable: c('0.10'), fixedPaid: c('0.20') },
      })
    );

    expect(snapshot.realSpend.toFixed()).toBe('0.30');
    expect(snapshot.remainingAvailable.toFixed()).toBe('0.00');
    expect(snapshot.executedRatio.toNumber()).toBe(1);
  });
});

describe('PeriodStatusResolver — cascada (RN-13 a RN-17)', () => {
  const resolve = (i: PeriodCalculationInput) =>
    PeriodStatusResolver.resolve(PeriodCalculator.calculate(i), THRESHOLD);

  it('RN-13 SIN_INGRESO gana sobre todo lo demás', () => {
    expect(resolve(input({ plannedIncome: null, totals: { variable: c('5000') } }))).toBe(
      'SIN_INGRESO'
    );
  });

  it('RN-14 SOBREGIRO cuando las salidas superan el disponible', () => {
    expect(resolve(input({ totals: { variable: c('9000') } }))).toBe('SOBREGIRO');
  });

  it('RN-14 el ahorro sí puede provocar sobregiro', () => {
    expect(
      resolve(input({ totals: { fixedPaid: c('6050'), variable: c('1000'), savingsSetAside: c('2000') } }))
    ).toBe('SOBREGIRO');
  });

  it('RN-15 NO_ALCANZA_FIJOS cuando el restante proyectado es negativo', () => {
    expect(resolve(input({ totals: { variable: c('4000') } }))).toBe('NO_ALCANZA_FIJOS');
  });

  it('RN-16 CERCA_DEL_LIMITE al alcanzar el umbral, con >= no >', () => {
    // gastoReal 6800 / 8500 = exactamente 0,80
    const status = resolve(input({ budgetedFixed: c('0'), totals: { variable: c('6800') } }));
    expect(status).toBe('CERCA_DEL_LIMITE');
  });

  it('RN-17 EN_ORDEN justo por debajo del umbral', () => {
    const status = resolve(input({ budgetedFixed: c('0'), totals: { variable: c('6799') } }));
    expect(status).toBe('EN_ORDEN');
  });

  it('apartar ahorro no lleva a CERCA_DEL_LIMITE (D3)', () => {
    // El ahorro sube el comprometido al 96 %, pero el ejecutado sigue en 40 %.
    const status = resolve(
      input({ budgetedFixed: c('0'), totals: { variable: c('3400'), savingsSetAside: c('4800') } })
    );
    expect(status).toBe('EN_ORDEN');
  });

  it('explain indica qué RN decidió el estado', () => {
    const snapshot = PeriodCalculator.calculate(input({ totals: { variable: c('9000') } }));
    expect(PeriodStatusResolver.explain(snapshot, THRESHOLD)).toEqual({
      status: 'SOBREGIRO',
      rule: 'RN-14',
    });
  });
});
