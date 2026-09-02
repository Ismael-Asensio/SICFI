import { describe, expect, it } from 'vitest';

import { CalendarDate } from './calendar-date.vo';
import { CurrencyConverter } from './currency-converter.service';
import { Currency } from './currency.vo';
import type { ExchangeRateProvider, ExchangeRateQuery } from './exchange-rate-provider.port';
import { ExchangeRate } from './exchange-rate.vo';
import { Money } from './money.vo';

const NIO = Currency.NIO;
const USD = Currency.USD;
const date = (iso: string): CalendarDate => {
  const result = CalendarDate.fromISO(iso);
  if (!result.ok) throw result.error;
  return result.value;
};

const rate = (iso: string, value: string): ExchangeRate => {
  const result = ExchangeRate.of({ base: NIO, quote: USD, date: date(iso), rate: value });
  if (!result.ok) throw result.error;
  return result.value;
};

/**
 * Proveedor en memoria que implementa RN-37: tasa exacta o la más reciente
 * anterior. Es la misma semántica que tendrá el adaptador de Prisma.
 */
class InMemoryRates implements ExchangeRateProvider {
  readonly queries: ExchangeRateQuery[] = [];

  constructor(private readonly rates: ExchangeRate[] = []) {}

  findEffectiveRate(query: ExchangeRateQuery): Promise<ExchangeRate | null> {
    this.queries.push(query);

    const applicable = this.rates
      .filter((r) => r.base.equals(query.base) && r.quote.equals(query.quote))
      .filter((r) => r.date.isSameOrBefore(query.date))
      .sort((a, b) => b.date.compare(a.date));

    return Promise.resolve(applicable[0] ?? null);
  }
}

const converter = (rates: ExchangeRate[] = []): CurrencyConverter =>
  new CurrencyConverter(new InMemoryRates(rates));

describe('CurrencyConverter — moneda base (RN-37)', () => {
  it('no consulta ninguna tasa si la moneda ya es la base', async () => {
    const provider = new InMemoryRates();
    const result = await new CurrencyConverter(provider).toBaseCurrency({
      householdId: 'hh-1',
      amount: Money.unsafe('500', NIO),
      baseCurrency: NIO,
      date: date('2026-03-10'),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.exchangeRate.toNumber()).toBe(1);
      expect(result.value.baseAmount.toFixed()).toBe('500.00');
    }
    expect(provider.queries).toHaveLength(0);
  });
});

describe('CurrencyConverter — conversión (RN-36)', () => {
  it('multiplica por la tasa y devuelve el importe en moneda base', async () => {
    const result = await converter([rate('2026-03-10', '36.60')]).toBaseCurrency({
      householdId: 'hh-1',
      amount: Money.unsafe('100', USD),
      baseCurrency: NIO,
      date: date('2026-03-10'),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.baseAmount.toFixed()).toBe('3660.00');
      expect(result.value.baseAmount.currency.equals(NIO)).toBe(true);
      // El importe original se conserva tal y como lo capturó el usuario.
      expect(result.value.original.toFixed()).toBe('100.00');
      expect(result.value.original.currency.equals(USD)).toBe(true);
    }
  });

  it('redondea el resultado a 2 decimales', async () => {
    const result = await converter([rate('2026-03-10', '36.6055')]).toBaseCurrency({
      householdId: 'hh-1',
      amount: Money.unsafe('33.33', USD),
      baseCurrency: NIO,
      date: date('2026-03-10'),
    });
    // 33,33 × 36,6055 = 1220,061... → 1220,06
    expect(result.ok && result.value.baseAmount.toFixed()).toBe('1220.06');
  });
});

describe('CurrencyConverter — resolución de la tasa (RN-37)', () => {
  const rates = [rate('2026-01-15', '36.00'), rate('2026-03-01', '36.60')];

  it('usa la tasa exacta de la fecha cuando existe', async () => {
    const result = await converter(rates).toBaseCurrency({
      householdId: 'hh-1',
      amount: Money.unsafe('100', USD),
      baseCurrency: NIO,
      date: date('2026-03-01'),
    });
    expect(result.ok && result.value.baseAmount.toFixed()).toBe('3660.00');
  });

  it('usa la más reciente ANTERIOR si no hay tasa para esa fecha', async () => {
    const result = await converter(rates).toBaseCurrency({
      householdId: 'hh-1',
      amount: Money.unsafe('100', USD),
      baseCurrency: NIO,
      date: date('2026-02-10'), // entre las dos tasas
    });
    expect(result.ok && result.value.baseAmount.toFixed()).toBe('3600.00');
  });

  it('nunca usa una tasa posterior a la fecha del movimiento', async () => {
    const result = await converter(rates).toBaseCurrency({
      householdId: 'hh-1',
      amount: Money.unsafe('100', USD),
      baseCurrency: NIO,
      date: date('2026-01-01'), // anterior a todas
    });
    expect(result.ok).toBe(false);
  });

  it('rechaza el movimiento si no hay ninguna tasa aplicable', async () => {
    const result = await converter().toBaseCurrency({
      householdId: 'hh-1',
      amount: Money.unsafe('100', USD),
      baseCurrency: NIO,
      date: date('2026-03-10'),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.details.rule).toBe('RN-37');
      // Rechazar y pedir la tasa; inventarse un 1 metería US$ 100 como C$ 100.
      expect(result.error.message).toContain('Captúralo');
    }
  });

  it('consulta usando la fecha del movimiento, no la de hoy', async () => {
    const provider = new InMemoryRates([rate('2026-01-15', '36.00')]);
    await new CurrencyConverter(provider).toBaseCurrency({
      householdId: 'hh-1',
      amount: Money.unsafe('100', USD),
      baseCurrency: NIO,
      date: date('2026-02-10'),
    });
    expect(provider.queries[0]?.date.toISO()).toBe('2026-02-10');
  });
});

describe('CurrencyConverter — edición de un movimiento (RN-38)', () => {
  const rates = [rate('2026-01-15', '36.00'), rate('2026-06-01', '40.00')];

  it('conserva la tasa histórica si no cambian ni fecha ni moneda', async () => {
    const result = await converter(rates).recalculateOnEdit({
      householdId: 'hh-1',
      baseCurrency: NIO,
      previous: {
        date: date('2026-01-20'),
        currency: USD,
        exchangeRate: rate('2026-01-15', '36.00').rate,
      },
      // Solo cambió el importe.
      next: { date: date('2026-01-20'), amount: Money.unsafe('200', USD) },
    });

    // Con la tasa de hoy (40) daría 8 000. Debe conservar la de entonces.
    expect(result.ok && result.value.baseAmount.toFixed()).toBe('7200.00');
    expect(result.ok && result.value.exchangeRate.toNumber()).toBe(36);
  });

  it('recalcula si cambia la fecha', async () => {
    const result = await converter(rates).recalculateOnEdit({
      householdId: 'hh-1',
      baseCurrency: NIO,
      previous: {
        date: date('2026-01-20'),
        currency: USD,
        exchangeRate: rate('2026-01-15', '36.00').rate,
      },
      next: { date: date('2026-06-10'), amount: Money.unsafe('100', USD) },
    });

    expect(result.ok && result.value.exchangeRate.toNumber()).toBe(40);
    expect(result.ok && result.value.baseAmount.toFixed()).toBe('4000.00');
  });

  it('recalcula si cambia la moneda', async () => {
    const result = await converter(rates).recalculateOnEdit({
      householdId: 'hh-1',
      baseCurrency: NIO,
      previous: {
        date: date('2026-06-10'),
        currency: USD,
        exchangeRate: rate('2026-06-01', '40.00').rate,
      },
      // Pasó a estar en la moneda base: la tasa vuelve a 1.
      next: { date: date('2026-06-10'), amount: Money.unsafe('100', NIO) },
    });

    expect(result.ok && result.value.exchangeRate.toNumber()).toBe(1);
    expect(result.ok && result.value.baseAmount.toFixed()).toBe('100.00');
  });
});

describe('ExchangeRate — validación', () => {
  it('rechaza tasas cero o negativas', () => {
    const base = { base: NIO, quote: USD, date: date('2026-03-10') };
    expect(ExchangeRate.of({ ...base, rate: '0' }).ok).toBe(false);
    expect(ExchangeRate.of({ ...base, rate: '-36' }).ok).toBe(false);
    expect(ExchangeRate.of({ ...base, rate: 'abc' }).ok).toBe(false);
  });

  it('rechaza una tasa de una moneda contra sí misma', () => {
    expect(
      ExchangeRate.of({ base: NIO, quote: NIO, date: date('2026-03-10'), rate: '1' }).ok
    ).toBe(false);
  });

  it('la tasa identidad siempre vale 1', () => {
    expect(ExchangeRate.identity(NIO, date('2026-03-10')).rate.toNumber()).toBe(1);
  });
});
