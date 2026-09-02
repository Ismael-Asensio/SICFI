/**
 * `DueDay` — día del mes en que vence un gasto fijo. 1..31.
 *
 * Admite 29, 30 y 31 aunque no existan en todos los meses: son días de pago
 * legítimos ("me cobran el 31"). El recorte al mes real lo hace RN-21 al calcular
 * la fecha límite concreta, no la captura del dato.
 */
import { ValidationError, type DomainError } from '../../../shared/domain/domain-error';
import { err, ok, type Result } from '../../../shared/domain/result';
import { ValueObject } from '../../../shared/domain/value-object';

export class DueDay extends ValueObject {
  private constructor(readonly value: number) {
    super();
    this.seal();
  }

  static of(value: number): Result<DueDay, DomainError> {
    if (!Number.isInteger(value) || value < 1 || value > 31) {
      return err(
        new ValidationError(`Día de pago fuera de rango: ${value}. Debe ser un entero 1..31`, {
          dueDay: value,
        })
      );
    }
    return ok(new DueDay(value));
  }

  static unsafe(value: number): DueDay {
    const result = DueDay.of(value);
    if (!result.ok) throw result.error;
    return result.value;
  }

  /** RN-18: en un fijo mensual, el día decide a qué mitad del mes pertenece. */
  get fallsInFirstHalf(): boolean {
    return this.value <= 15;
  }

  protected components(): readonly unknown[] {
    return [this.value];
  }

  toString(): string {
    return String(this.value);
  }
}
