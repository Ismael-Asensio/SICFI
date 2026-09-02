/**
 * Evento de dominio: algo que ya ocurrió, nombrado en pasado.
 *
 * `occurredAt` lo inyecta quien construye el evento (con el puerto `Clock`),
 * porque `new Date()` está prohibido dentro del dominio.
 */
export interface DomainEvent {
  readonly name: string;
  readonly aggregateId: string;
  readonly householdId: string;
  readonly occurredAt: Date;
  readonly payload: Readonly<Record<string, unknown>>;
}

export function domainEvent(
  name: string,
  aggregateId: string,
  householdId: string,
  occurredAt: Date,
  payload: Readonly<Record<string, unknown>> = {}
): DomainEvent {
  return Object.freeze({ name, aggregateId, householdId, occurredAt, payload });
}
