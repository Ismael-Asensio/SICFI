/**
 * Entidades y raíces de agregado.
 *
 * Una entidad se define por su identidad, no por sus valores: dos movimientos
 * con el mismo importe y fecha son entidades distintas si tienen `id` distinto.
 */
import type { DomainEvent } from './domain-event';

export abstract class Entity<TId = string> {
  protected constructor(readonly id: TId) {}

  equals(other: unknown): boolean {
    if (this === other) return true;
    if (!(other instanceof Entity)) return false;
    if (this.constructor !== other.constructor) return false;
    return this.id === other.id;
  }
}

/**
 * Raíz de agregado: la única puerta de entrada a su grafo de objetos y la
 * frontera de consistencia transaccional.
 *
 * Acumula eventos de dominio que la capa de aplicación publica **después** de
 * persistir con éxito. Emitirlos antes provocaría notificar cambios que luego
 * se deshacen si la transacción falla.
 */
export abstract class AggregateRoot<TId = string> extends Entity<TId> {
  #events: DomainEvent[] = [];

  protected record(event: DomainEvent): void {
    this.#events.push(event);
  }

  /** Vacía y devuelve los eventos pendientes. Lo llama la capa de aplicación. */
  pullEvents(): readonly DomainEvent[] {
    const pending = this.#events;
    this.#events = [];
    return pending;
  }

  get hasPendingEvents(): boolean {
    return this.#events.length > 0;
  }
}
