/**
 * `Money` — importe + moneda, sobre `Decimal.js`.
 *
 * Dos motivos para que exista:
 *
 * 1. **Nunca `number`.** `0.1 + 0.2` en coma flotante da `0.30000000000000004`.
 *    En una app de dinero eso no es una curiosidad: es un saldo equivocado.
 * 2. **Nunca sumar monedas distintas a ciegas.** Sumar C$ con US$ como si
 *    fueran lo mismo produce totales sin sentido que nadie detecta hasta que
 *    cuadra mal el mes.
 *
 * ── Sobre la excepción en `plus`/`minus` ──────────────────────────────────
 * `domain/` no lanza errores **de negocio**: los devuelve en un `Result`. Pero
 * mezclar monedas no es un error del usuario, es un error del programador: el
 * usuario nunca pide "suma estos dos importes", lo decide el código, y para
 * cuando suma ya debería haber garantizado que la moneda es homogénea.
 * Por eso `plus` lanza `CurrencyMismatchError` — es una aserción, inalcanzable
 * en código correcto. `tryPlus`/`tryMinus` existen para los pocos sitios donde
 * la moneda sí viene de fuera y el fallo es esperable.
 * El plan lo sanciona explícitamente: «debe fallar en compilación o lanzar,
 * nunca sumar a ciegas».
 */
import Decimal from 'decimal.js';

import { Currency } from './currency.vo';
import { DomainError, ValidationError } from './domain-error';
import { err, ok, type Result } from './result';
import { ValueObject } from './value-object';

/**
 * Clon local de Decimal: configurar el global afectaría a cualquier otra
 * librería que también lo use.
 *
 * `ROUND_HALF_UP` es la convención contable (0,005 → 0,01). El default de
 * Decimal.js es `ROUND_HALF_UP` para `toDP`, pero se fija explícito porque de
 * este ajuste depende que los totales cuadren con el Excel.
 */
const D = Decimal.clone({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

/** Todas las monedas del sistema usan 2 decimales (`Decimal(14,2)` en Postgres). */
const MINOR_UNITS = 2;

export type MoneyInput = Decimal | number | string;

export class CurrencyMismatchError extends DomainError {
  readonly code = 'CURRENCY_MISMATCH';

  constructor(left: Currency, right: Currency, operation: string) {
    super(
      `No se puede ${operation} ${left.code} con ${right.code}: ` +
        'convierte a una moneda común antes de operar',
      { left: left.code, right: right.code, operation }
    );
  }
}

export class Money extends ValueObject {
  private constructor(
    readonly amount: Decimal,
    readonly currency: Currency
  ) {
    super();
    this.seal();
  }

  // ─────────────────────────── Construcción ───────────────────────────

  static of(amount: MoneyInput, currency: Currency): Result<Money, DomainError> {
    let value: Decimal;

    try {
      value = new D(amount as Decimal.Value);
    } catch {
      return err(new ValidationError(`Importe no numérico: "${String(amount)}"`, { amount }));
    }

    if (!value.isFinite()) {
      return err(new ValidationError(`Importe no finito: "${String(amount)}"`, { amount }));
    }

    return ok(new Money(value.toDecimalPlaces(MINOR_UNITS), currency));
  }

  /** Para constantes y valores ya validados. Lanza: sería un bug, no input malo. */
  static unsafe(amount: MoneyInput, currency: Currency): Money {
    const result = Money.of(amount, currency);
    if (!result.ok) throw result.error;
    return result.value;
  }

  static zero(currency: Currency): Money {
    return new Money(new D(0).toDecimalPlaces(MINOR_UNITS), currency);
  }

  /**
   * Suma una lista homogénea. `currency` es obligatoria para que sumar una lista
   * vacía devuelva un cero con moneda, no un `undefined` que reviente después.
   */
  static sum(values: readonly Money[], currency: Currency): Money {
    return values.reduce<Money>((total, value) => total.plus(value), Money.zero(currency));
  }

  static max(a: Money, b: Money): Money {
    a.assertSameCurrency(b, 'comparar');
    return a.isGreaterThan(b) ? a : b;
  }

  static min(a: Money, b: Money): Money {
    a.assertSameCurrency(b, 'comparar');
    return a.isLessThan(b) ? a : b;
  }

  // ─────────────────────────── Aritmética ───────────────────────────

  private assertSameCurrency(other: Money, operation: string): void {
    if (!this.currency.equals(other.currency)) {
      throw new CurrencyMismatchError(this.currency, other.currency, operation);
    }
  }

  plus(other: Money): Money {
    this.assertSameCurrency(other, 'sumar');
    return new Money(this.amount.plus(other.amount).toDecimalPlaces(MINOR_UNITS), this.currency);
  }

  minus(other: Money): Money {
    this.assertSameCurrency(other, 'restar');
    return new Money(this.amount.minus(other.amount).toDecimalPlaces(MINOR_UNITS), this.currency);
  }

  /** Variante segura para cuando la moneda del operando viene de fuera. */
  tryPlus(other: Money): Result<Money, DomainError> {
    if (!this.currency.equals(other.currency)) {
      return err(new CurrencyMismatchError(this.currency, other.currency, 'sumar'));
    }
    return ok(this.plus(other));
  }

  tryMinus(other: Money): Result<Money, DomainError> {
    if (!this.currency.equals(other.currency)) {
      return err(new CurrencyMismatchError(this.currency, other.currency, 'restar'));
    }
    return ok(this.minus(other));
  }

  times(factor: MoneyInput): Money {
    return new Money(
      this.amount.times(new D(factor as Decimal.Value)).toDecimalPlaces(MINOR_UNITS),
      this.currency
    );
  }

  dividedBy(divisor: MoneyInput): Result<Money, DomainError> {
    const value = new D(divisor as Decimal.Value);
    if (value.isZero()) {
      return err(new ValidationError('División por cero al operar con un importe'));
    }
    return ok(
      new Money(this.amount.dividedBy(value).toDecimalPlaces(MINOR_UNITS), this.currency)
    );
  }

  negated(): Money {
    return new Money(this.amount.negated(), this.currency);
  }

  abs(): Money {
    return new Money(this.amount.abs(), this.currency);
  }

  /** Recorta a cero los negativos. Es el `max(0, x)` de RN-09. */
  clampToZero(): Money {
    return this.isNegative() ? Money.zero(this.currency) : this;
  }

  /**
   * Proporción entre dos importes, como `Decimal` sin moneda.
   * Un cociente de dinero no es dinero: C$ 100 / C$ 200 es 0,5, no C$ 0,5.
   * Devuelve 0 si el divisor es cero — es lo que exige RN-12.
   */
  ratioTo(other: Money): Decimal {
    this.assertSameCurrency(other, 'comparar');
    if (other.amount.isZero()) return new D(0);
    return this.amount.dividedBy(other.amount);
  }

  // ─────────────────────────── Comparación ───────────────────────────

  isZero(): boolean {
    return this.amount.isZero();
  }

  isPositive(): boolean {
    return this.amount.greaterThan(0);
  }

  isNegative(): boolean {
    return this.amount.lessThan(0);
  }

  isGreaterThan(other: Money): boolean {
    this.assertSameCurrency(other, 'comparar');
    return this.amount.greaterThan(other.amount);
  }

  isGreaterThanOrEqual(other: Money): boolean {
    this.assertSameCurrency(other, 'comparar');
    return this.amount.greaterThanOrEqualTo(other.amount);
  }

  isLessThan(other: Money): boolean {
    this.assertSameCurrency(other, 'comparar');
    return this.amount.lessThan(other.amount);
  }

  isLessThanOrEqual(other: Money): boolean {
    this.assertSameCurrency(other, 'comparar');
    return this.amount.lessThanOrEqualTo(other.amount);
  }

  // ─────────────────────────── Salida ───────────────────────────

  /** Representación para persistir en `Decimal(14,2)`. Siempre 2 decimales. */
  toFixed(): string {
    return this.amount.toFixed(MINOR_UNITS);
  }

  toDecimal(): Decimal {
    return this.amount;
  }

  /**
   * ⚠️ Solo para presentación y gráficas. Nunca para acumular ni comparar:
   * ahí vuelve la coma flotante y con ella los `0.30000000000000004`.
   */
  toNumber(): number {
    return this.amount.toNumber();
  }

  protected components(): readonly unknown[] {
    return [this.amount, this.currency];
  }

  toString(): string {
    return `${this.toFixed()} ${this.currency.code}`;
  }
}
