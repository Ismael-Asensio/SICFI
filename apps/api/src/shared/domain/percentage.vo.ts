/**
 * `Percentage` — una proporción, guardada como fracción (0,80), no como 80.
 *
 * Guardarla como fracción evita el error clásico de comparar un 0,80 contra un
 * umbral escrito como 80 y concluir que nunca se supera. `spendThreshold` es
 * `Decimal(4,3)` en la base justamente por esto.
 *
 * Puede pasar de 1: gastar el 120 % del disponible es un sobregiro, no un valor
 * imposible que haya que recortar.
 */
import Decimal from 'decimal.js';

import { ValidationError, type DomainError } from './domain-error';
import { err, ok, type Result } from './result';
import { ValueObject } from './value-object';

const D = Decimal.clone({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export class Percentage extends ValueObject {
  private constructor(readonly ratio: Decimal) {
    super();
    this.seal();
  }

  /** Desde una fracción: 0,8 → 80 %. */
  static fromRatio(ratio: Decimal | number | string): Result<Percentage, DomainError> {
    let value: Decimal;
    try {
      value = new D(ratio as Decimal.Value);
    } catch {
      return err(new ValidationError(`Proporción no numérica: "${String(ratio)}"`));
    }

    if (!value.isFinite()) {
      return err(new ValidationError(`Proporción no finita: "${String(ratio)}"`));
    }
    if (value.isNegative()) {
      return err(
        new ValidationError(`Una proporción no puede ser negativa: ${value.toString()}`, {
          ratio: value.toString(),
        })
      );
    }

    return ok(new Percentage(value));
  }

  /** Desde un porcentaje escrito como tal: 80 → 80 %. */
  static fromPercent(percent: Decimal | number | string): Result<Percentage, DomainError> {
    return Percentage.fromRatio(new D(percent as Decimal.Value).dividedBy(100));
  }

  static unsafe(ratio: Decimal | number | string): Percentage {
    const result = Percentage.fromRatio(ratio);
    if (!result.ok) throw result.error;
    return result.value;
  }

  static readonly ZERO = Percentage.unsafe(0);

  /** Valor para mostrar: 0,8 → 80. */
  toPercent(): Decimal {
    return this.ratio.times(100);
  }

  /** Redondeado a `decimals` cifras, para la UI. */
  toPercentString(decimals = 1): string {
    return this.toPercent().toFixed(decimals);
  }

  toNumber(): number {
    return this.ratio.toNumber();
  }

  /** RN-16: comparación contra `spendThreshold`. El límite se alcanza con `>=`. */
  isAtLeast(other: Percentage): boolean {
    return this.ratio.greaterThanOrEqualTo(other.ratio);
  }

  isGreaterThan(other: Percentage): boolean {
    return this.ratio.greaterThan(other.ratio);
  }

  isZero(): boolean {
    return this.ratio.isZero();
  }

  /** Pasa del 100 %: hay sobregasto. */
  get exceedsWhole(): boolean {
    return this.ratio.greaterThan(1);
  }

  protected components(): readonly unknown[] {
    return [this.ratio];
  }

  toString(): string {
    return `${this.toPercentString()} %`;
  }
}
