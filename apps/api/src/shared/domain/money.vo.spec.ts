import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { Currency } from './currency.vo';
import { CurrencyMismatchError, Money } from './money.vo';

const NIO = Currency.NIO;
const USD = Currency.USD;
const c = (amount: string | number): Money => Money.unsafe(amount, NIO);

describe('Money — precisión decimal', () => {
  it('no produce 0.30000000000000004 al sumar 0,1 y 0,2', () => {
    expect(c('0.10').plus(c('0.20')).toFixed()).toBe('0.30');
    // La comprobación que da sentido al test: con floats esto falla.
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  it('mantiene exactitud sumando 0,01 cien veces', () => {
    let total = Money.zero(NIO);
    for (let i = 0; i < 100; i += 1) total = total.plus(c('0.01'));
    expect(total.toFixed()).toBe('1.00');
  });

  it('cuadra el total de los 5 fijos del Excel sin arrastre', () => {
    const total = Money.sum(
      [c('2500.00'), c('2400.00'), c('400.00'), c('400.00'), c('700.00')],
      NIO
    );
    expect(total.toFixed()).toBe('6400.00');
  });

  it('redondea a 2 decimales con HALF_UP', () => {
    expect(Money.unsafe('0.005', NIO).toFixed()).toBe('0.01');
    expect(Money.unsafe('0.004', NIO).toFixed()).toBe('0.00');
    expect(Money.unsafe('2.345', NIO).toFixed()).toBe('2.35');
  });

  it('acepta string, number y Decimal como entrada', () => {
    expect(Money.unsafe('12.50', NIO).toFixed()).toBe('12.50');
    expect(Money.unsafe(12.5, NIO).toFixed()).toBe('12.50');
    expect(Money.unsafe(new Decimal('12.50'), NIO).toFixed()).toBe('12.50');
  });

  it('rechaza importes no numéricos o no finitos', () => {
    expect(Money.of('no-es-un-numero', NIO).ok).toBe(false);
    expect(Money.of(Number.POSITIVE_INFINITY, NIO).ok).toBe(false);
    expect(Money.of(Number.NaN, NIO).ok).toBe(false);
  });
});

describe('Money — monedas distintas', () => {
  it('lanza al sumar C$ con US$, nunca suma a ciegas', () => {
    expect(() => c('100').plus(Money.unsafe('100', USD))).toThrow(CurrencyMismatchError);
  });

  it('lanza también al restar y al comparar', () => {
    const usd = Money.unsafe('100', USD);
    expect(() => c('100').minus(usd)).toThrow(CurrencyMismatchError);
    expect(() => c('100').isGreaterThan(usd)).toThrow(CurrencyMismatchError);
    expect(() => c('100').ratioTo(usd)).toThrow(CurrencyMismatchError);
  });

  it('tryPlus devuelve Err en vez de lanzar', () => {
    const result = c('100').tryPlus(Money.unsafe('100', USD));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CURRENCY_MISMATCH');
  });

  it('tryPlus devuelve Ok con la misma moneda', () => {
    const result = c('100').tryPlus(c('50'));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.toFixed()).toBe('150.00');
  });

  it('dos importes iguales en monedas distintas no son iguales', () => {
    expect(Money.unsafe('100', NIO).equals(Money.unsafe('100', USD))).toBe(false);
    expect(Money.unsafe('100', NIO).equals(Money.unsafe('100', NIO))).toBe(true);
  });
});

describe('Money — operaciones', () => {
  it('suma una lista vacía como cero con moneda', () => {
    const total = Money.sum([], NIO);
    expect(total.isZero()).toBe(true);
    expect(total.currency.equals(NIO)).toBe(true);
  });

  it('clampToZero implementa el max(0, x) de RN-09', () => {
    expect(c('-50').clampToZero().toFixed()).toBe('0.00');
    expect(c('50').clampToZero().toFixed()).toBe('50.00');
    expect(c('0').clampToZero().toFixed()).toBe('0.00');
  });

  it('ratioTo devuelve 0 cuando el divisor es 0 (RN-12)', () => {
    expect(c('500').ratioTo(Money.zero(NIO)).toNumber()).toBe(0);
  });

  it('ratioTo calcula el porcentaje ejecutado', () => {
    expect(c('6800').ratioTo(c('8500')).toNumber()).toBeCloseTo(0.8, 10);
  });

  it('times duplica el costo de un fijo quincenal (RN-19)', () => {
    expect(c('2500').times(2).toFixed()).toBe('5000.00');
  });

  it('dividedBy rechaza el divisor cero', () => {
    expect(c('100').dividedBy(0).ok).toBe(false);
    const half = c('100').dividedBy(2);
    expect(half.ok && half.value.toFixed()).toBe('50.00');
  });

  it('negated y abs se comportan como se espera', () => {
    expect(c('100').negated().toFixed()).toBe('-100.00');
    expect(c('-100').abs().toFixed()).toBe('100.00');
  });

  it('max y min eligen correctamente', () => {
    expect(Money.max(c('100'), c('200')).toFixed()).toBe('200.00');
    expect(Money.min(c('100'), c('200')).toFixed()).toBe('100.00');
  });
});

describe('Money — inmutabilidad', () => {
  it('las operaciones devuelven instancias nuevas', () => {
    const original = c('100');
    const sum = original.plus(c('50'));
    expect(original.toFixed()).toBe('100.00');
    expect(sum.toFixed()).toBe('150.00');
    expect(sum).not.toBe(original);
  });

  it('la instancia está congelada', () => {
    expect(Object.isFrozen(c('100'))).toBe(true);
  });
});

describe('Currency', () => {
  it('normaliza a mayúsculas y recorta espacios', () => {
    const currency = Currency.of('  nio  ');
    expect(currency.ok && currency.value.code).toBe('NIO');
  });

  it('rechaza códigos que no sean 3 letras', () => {
    expect(Currency.of('NI').ok).toBe(false);
    expect(Currency.of('NIOS').ok).toBe(false);
    expect(Currency.of('N1O').ok).toBe(false);
    expect(Currency.of('').ok).toBe(false);
  });
});
