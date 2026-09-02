/**
 * Errores de dominio.
 *
 * Se devuelven dentro de un `Result`, nunca se lanzan desde `domain/`.
 * Extienden `Error` solo para conservar el stack en depuración; el flujo de
 * control jamás depende de un `try/catch` en el dominio.
 *
 * `code` es estable y sirve para que `infrastructure/http` lo traduzca a un
 * status HTTP y para que el frontend pueda reaccionar sin parsear mensajes.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(
    message: string,
    readonly details: Readonly<Record<string, unknown>> = {}
  ) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): { code: string; message: string; details: Record<string, unknown> } {
    return { code: this.code, message: this.message, details: { ...this.details } };
  }
}

/** Un valor no cumple una invariante: importe negativo, día 32, moneda inválida. */
export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR';
}

/** Se pidió algo que no existe dentro del household actual. */
export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
}

/** La operación es válida en sí pero rompe una regla de negocio en este estado. */
export class BusinessRuleError extends DomainError {
  readonly code = 'BUSINESS_RULE_VIOLATION';

  constructor(
    /** Regla infringida, p. ej. 'RN-41'. Se cita siempre para poder rastrearla. */
    readonly rule: string,
    message: string,
    details: Readonly<Record<string, unknown>> = {}
  ) {
    super(message, { ...details, rule });
  }
}

/** El rol del usuario no alcanza para esta operación (RN-43). */
export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
}

/**
 * Ya existe algo que ocuparía el mismo lugar: un nombre de categoría repetido,
 * un `code` de fijo duplicado. No es una regla de negocio numerada (RN-XX),
 * es la unicidad que ya expresa el esquema con `@@unique`.
 */
export class ConflictError extends DomainError {
  readonly code = 'CONFLICT';
}
