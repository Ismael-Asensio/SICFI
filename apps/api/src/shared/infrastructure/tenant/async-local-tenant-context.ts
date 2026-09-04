/**
 * Adaptador de `TenantContext` sobre `AsyncLocalStorage`.
 *
 * ¿Por qué ALS y no pasar el `householdId` por parámetro hasta el repositorio?
 * Porque el objetivo es que **no se pueda olvidar**. Un parámetro que hay que
 * ir pasando por cinco capas se omite tarde o temprano —y el día que se omita,
 * la consulta se ejecuta sin filtro. Con ALS el valor viaja solo por todo el
 * árbol de llamadas asíncronas de la petición, y la extensión de Prisma lo lee
 * en el último momento, justo antes de tocar la base.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';

import type { TenantContext, TenantScope } from '../../domain/tenant-context.port';

const SYSTEM_SCOPE: TenantScope = Object.freeze({
  householdId: null,
  userId: null,
  isSystem: true,
});

@Injectable()
export class AsyncLocalTenantContext implements TenantContext {
  private readonly storage = new AsyncLocalStorage<TenantScope>();

  current(): TenantScope | undefined {
    return this.storage.getStore();
  }

  requireHouseholdId(): string {
    const scope = this.storage.getStore();
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
      Object.freeze({ householdId: scope.householdId, userId: scope.userId, isSystem: false }),
      work
    );
  }

  runAsSystem<T>(work: () => Promise<T>): Promise<T> {
    return this.storage.run(SYSTEM_SCOPE, work);
  }
}
