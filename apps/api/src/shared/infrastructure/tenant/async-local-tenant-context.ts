/**
 * Adaptador de `TenantContext` sobre `AsyncLocalStorage`.
 *
 * ¿Por qué ALS y no pasar el `householdId` por parámetro hasta el repositorio?
 * Porque el objetivo es que **no se pueda olvidar**. Un parámetro que hay que
 * ir pasando por cinco capas se omite tarde o temprano —y el día que se omita,
 * la consulta se ejecuta sin filtro. Con ALS el valor viaja solo por todo el
 * árbol de llamadas asíncronas de la petición, y la extensión de Prisma lo lee
 * en el último momento, justo antes de tocar la base.
 *
 * ── El ciclo HTTP y por qué el almacén es MUTABLE ─────────────────────────
 * Un guard de Nest no puede envolver el resto de la petición en un callback:
 * devuelve un booleano y termina. La alternativa habitual, `enterWith()`, se
 * descarta a propósito: su alcance es "el resto del recurso asíncrono actual",
 * y si el runtime reutiliza ese recurso (keep-alive), el ámbito puede
 * **filtrarse de una petición a la siguiente**. En un discriminante de tenant
 * eso significa servirle a alguien los datos de otro household.
 *
 * Por eso el almacén es una caja mutable que abre un middleware (que sí tiene
 * `next()`), y el guard se limita a rellenarla:
 *
 *   middleware → `runUnresolved(next)`   abre la caja, todavía vacía
 *   guard      → `resolve({...})`        la rellena tras validar el JWT
 *
 * Mientras la caja siga vacía, `current()` devuelve `undefined` y la extensión
 * de Prisma lanza. Una ruta que se salte el guard no lee datos: falla.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';

import type { TenantContext, TenantScope } from '../../domain/tenant-context.port';

const SYSTEM_SCOPE: TenantScope = Object.freeze({
  householdId: null,
  userId: null,
  isSystem: true,
});

/** Caja mutable: el middleware la abre vacía y el guard la rellena. */
interface ScopeHolder {
  scope: TenantScope | undefined;
}

@Injectable()
export class AsyncLocalTenantContext implements TenantContext {
  private readonly storage = new AsyncLocalStorage<ScopeHolder>();

  current(): TenantScope | undefined {
    return this.storage.getStore()?.scope;
  }

  requireHouseholdId(): string {
    const scope = this.current();
    if (!scope || scope.householdId === null) {
      throw new Error(
        'No hay household activo en el contexto. ' +
          'Esta operación necesita TenantContext.runWith({ householdId, userId }, …).'
      );
    }
    return scope.householdId;
  }

  runWith<T>(scope: { householdId: string; userId: string }, work: () => Promise<T>): Promise<T> {
    return this.storage.run(
      {
        scope: Object.freeze({
          householdId: scope.householdId,
          userId: scope.userId,
          isSystem: false,
        }),
      },
      work
    );
  }

  runAsSystem<T>(work: () => Promise<T>): Promise<T> {
    return this.storage.run({ scope: SYSTEM_SCOPE }, work);
  }

  // ── Solo para el ciclo HTTP (middleware + guard) ──────────────────────

  /**
   * Abre un ámbito **sin resolver**. Hasta que alguien llame a `resolve()`,
   * cualquier consulta a una tabla con `householdId` sigue fallando.
   */
  runUnresolved<T>(work: () => T): T {
    return this.storage.run({ scope: undefined }, work);
  }

  /** Rellena el ámbito abierto por `runUnresolved`. Lo llama el `JwtAuthGuard`. */
  resolve(scope: { householdId: string; userId: string }): void {
    const holder = this.storage.getStore();
    if (!holder) {
      throw new Error(
        'No hay ámbito de tenant abierto que resolver. ' +
          'Falta registrar TenantContextMiddleware antes de los guards.'
      );
    }
    holder.scope = Object.freeze({
      householdId: scope.householdId,
      userId: scope.userId,
      isSystem: false,
    });
  }

  /** ¿Se abrió ya un ámbito (aunque esté sin resolver)? */
  hasOpenScope(): boolean {
    return this.storage.getStore() !== undefined;
  }
}
