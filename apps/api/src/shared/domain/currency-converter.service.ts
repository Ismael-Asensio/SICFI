/**
 * `CurrencyConverter` — RN-36, RN-37, RN-38.
 *
 * Convierte el importe capturado por el usuario a la moneda base del household y
 * devuelve, además del resultado, **la tasa aplicada**: hay que persistirla junto
 * al movimiento para que el histórico no dependa de la cotización de hoy.
 */
import type Decimal from 'decimal.js';

import type { CalendarDate } from './calendar-date.vo';
import type { Currency } from './currency.vo';
import { BusinessRuleError, type DomainError } from './domain-error';
import type { ExchangeRateProvider } from './exchange-rate-provider.port';
import { ExchangeRate } from './exchange-rate.vo';
import { Money } from './money.vo';
import { err, ok, type Result } from './result';

export interface ConversionResult {
  /** El importe tal y como lo capturó el usuario. */
  readonly original: Money;
  /** `original × exchangeRate`, en la moneda base. Lo que agregan los reportes. */
  readonly baseAmount: Money;
  /** Tasa aplicada. Se persiste para que el movimiento conserve su historia. */
  readonly exchangeRate: Decimal;
}

export class CurrencyConverter {
  constructor(private readonly rates: ExchangeRateProvider) {}

  /**
   * Convierte `amount` a `baseCurrency` usando la tasa vigente en `date`.
   *
   * - Si la moneda ya es la base, la tasa es 1 y no se consulta nada (RN-37).
   * - Si no hay tasa para esa fecha, el proveedor devuelve la más reciente anterior.
   * - Si no existe ninguna, se **rechaza** pidiendo capturarla: inventarse un 1
   *   metería un gasto de US$ 100 como si fueran C$ 100.
   */
  async toBaseCurrency(params: {
    householdId: string;
    amount: Money;
    baseCurrency: Currency;
    date: CalendarDate;
  }): Promise<Result<ConversionResult, DomainError>> {
    const { householdId, amount, baseCurrency, date } = params;

    if (amount.currency.equals(baseCurrency)) {
      const identity = ExchangeRate.identity(baseCurrency, date);
      return ok({ original: amount, baseAmount: amount, exchangeRate: identity.rate });
    }

    const rate = await this.rates.findEffectiveRate({
      householdId,
      base: baseCurrency,
      quote: amount.currency,
      date,
    });

    if (!rate) {
      return err(
        new BusinessRuleError(
          'RN-37',
          `No hay tipo de cambio de ${amount.currency.code} a ${baseCurrency.code} ` +
            `para el ${date.toISO()} ni ninguna fecha anterior. Captúralo antes de continuar.`,
          { from: amount.currency.code, to: baseCurrency.code, date: date.toISO() }
        )
      );
    }

    return ok({
      original: amount,
      baseAmount: Money.unsafe(amount.toDecimal().times(rate.rate), baseCurrency),
      exchangeRate: rate.rate,
    });
  }

  /**
   * Reconversión al editar un movimiento (RN-38).
   *
   * Solo se recalcula la tasa si cambió la fecha o la moneda. Si el usuario solo
   * corrigió el concepto o el importe, se conserva la tasa histórica: un gasto de
   * hace tres meses no debe revalorizarse porque hoy el dólar esté a otro precio.
   */
  async recalculateOnEdit(params: {
    householdId: string;
    baseCurrency: Currency;
    previous: { date: CalendarDate; currency: Currency; exchangeRate: Decimal };
    next: { date: CalendarDate; amount: Money };
  }): Promise<Result<ConversionResult, DomainError>> {
    const { householdId, baseCurrency, previous, next } = params;

    const dateChanged = !previous.date.equals(next.date);
    const currencyChanged = !previous.currency.equals(next.amount.currency);

    if (dateChanged || currencyChanged) {
      return this.toBaseCurrency({
        householdId,
        amount: next.amount,
        baseCurrency,
        date: next.date,
      });
    }

    return ok({
      original: next.amount,
      baseAmount: Money.unsafe(next.amount.toDecimal().times(previous.exchangeRate), baseCurrency),
      exchangeRate: previous.exchangeRate,
    });
  }
}
