/**
 * `ExchangeRate` — tasa histórica entre dos monedas en una fecha concreta.
 *
 * Es **inmutable e histórica** (RN-38): un gasto de hace tres meses conserva la
 * tasa de aquel día. Reescribir el pasado cada vez que fluctúa el dólar es la
 * diferencia entre un sistema contable y uno que miente sobre lo que pasó.
 *
 * Convención: `1 quote = rate × base`. Con base NIO y quote USD, `rate = 36.60`
 * significa que 1 US$ son C$ 36,60.
 */
import Decimal from 'decimal.js';

import type { CalendarDate } from './calendar-date.vo';
import type { Currency } from './currency.vo';
import { ValidationError, type DomainError } from './domain-error';
import { err, ok, type Result } from './result';
import { ValueObject } from './value-object';

const D = Decimal.clone({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

/** La columna es `Decimal(18,8)`. */
const RATE_DECIMALS = 8;

export type ExchangeRateSource = 'MANUAL' | 'BCN' | 'API';

export class ExchangeRate extends ValueObject {
  private constructor(
    readonly base: Currency,
    readonly quote: Currency,
    readonly date: CalendarDate,
    readonly rate: Decimal,
    readonly source: ExchangeRateSource
  ) {
    super();
    this.seal();
  }

  static of(params: {
    base: Currency;
    quote: Currency;
    date: CalendarDate;
    rate: Decimal | number | string;
    source?: ExchangeRateSource;
  }): Result<ExchangeRate, DomainError> {
    const { base, quote, date, rate, source = 'MANUAL' } = params;

    if (base.equals(quote)) {
      return err(
        new ValidationError(
          `Una tasa de ${base.code} contra sí misma no tiene sentido: siempre es 1`,
          { base: base.code }
        )
      );
    }

    let value: Decimal;
    try {
      value = new D(rate as Decimal.Value);
    } catch {
      return err(new ValidationError(`Tasa de cambio no numérica: "${String(rate)}"`));
    }

    if (!value.isFinite() || value.lessThanOrEqualTo(0)) {
      return err(
        new ValidationError(`La tasa de cambio debe ser positiva, se recibió ${String(rate)}`, {
          rate: String(rate),
        })
      );
    }

    return ok(
      new ExchangeRate(base, quote, date, value.toDecimalPlaces(RATE_DECIMALS), source)
    );
  }

  /** Tasa identidad: convertir una moneda a sí misma siempre es 1 (RN-37). */
  static identity(currency: Currency, date: CalendarDate): ExchangeRate {
    return new ExchangeRate(currency, currency, date, new D(1), 'MANUAL');
  }

  protected components(): readonly unknown[] {
    return [this.base, this.quote, this.date, this.rate, this.source];
  }

  toString(): string {
    return `1 ${this.quote.code} = ${this.rate.toString()} ${this.base.code} (${this.date.toISO()})`;
  }
}
