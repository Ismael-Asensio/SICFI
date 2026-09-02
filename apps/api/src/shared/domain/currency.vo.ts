/**
 * `Currency` — código ISO 4217 de tres letras mayúsculas.
 *
 * Existe como tipo propio para que `Money` no pueda construirse con una cadena
 * cualquiera y para que la comparación entre monedas sea explícita.
 */
import { ValidationError, type DomainError } from './domain-error';
import { err, ok, type Result } from './result';
import { ValueObject } from './value-object';

const ISO_4217 = /^[A-Z]{3}$/;

export class Currency extends ValueObject {
  private constructor(readonly code: string) {
    super();
    this.seal();
  }

  static of(code: string): Result<Currency, DomainError> {
    const normalized = code.trim().toUpperCase();

    if (!ISO_4217.test(normalized)) {
      return err(
        new ValidationError(
          `Moneda inválida: "${code}". Se espera un código ISO 4217 de 3 letras`,
          { code }
        )
      );
    }

    return ok(new Currency(normalized));
  }

  static unsafe(code: string): Currency {
    const result = Currency.of(code);
    if (!result.ok) throw result.error;
    return result.value;
  }

  /** Córdoba nicaragüense — la moneda base del usuario real. */
  static readonly NIO = Currency.unsafe('NIO');
  static readonly USD = Currency.unsafe('USD');

  protected components(): readonly unknown[] {
    return [this.code];
  }

  toString(): string {
    return this.code;
  }
}
