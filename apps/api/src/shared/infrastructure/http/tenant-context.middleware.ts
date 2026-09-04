/**
 * Abre el ámbito de tenant para toda la petición.
 *
 * Va en un middleware y no en el guard porque un middleware tiene `next()`: el
 * `AsyncLocalStorage.run()` envuelve de verdad el resto de la petición. Un
 * guard no puede hacerlo (devuelve un booleano y termina), y la alternativa
 * `enterWith()` puede filtrar el ámbito entre peticiones sobre una conexión
 * keep-alive — inaceptable para un discriminante de tenant.
 *
 * El ámbito se abre **vacío**: quien lo rellena es `JwtAuthGuard`, después de
 * verificar el JWT. Hasta entonces, cualquier consulta con `householdId` falla.
 */
import { Injectable, type NestMiddleware } from '@nestjs/common';

import { AsyncLocalTenantContext } from '../tenant/async-local-tenant-context';

type Next = () => void;

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(private readonly tenant: AsyncLocalTenantContext) {}

  use(_request: unknown, _response: unknown, next: Next): void {
    this.tenant.runUnresolved(next);
  }
}
