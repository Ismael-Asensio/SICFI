/**
 * Puerto `TenantContext` — quién es el household activo durante esta operación.
 *
 * Es la mitad "de dónde sale el `householdId`" de la capa 2 de seguridad
 * (CLAUDE.md §7). La otra mitad es la `tenantExtension` de Prisma, que lo
 * inyecta en toda consulta.
 *
 * Tres estados posibles, y la diferencia entre ellos es deliberada:
 *
 *   · **con household**  → toda consulta se filtra por él;
 *   · **sistema**        → sin household, pero DECLARADO explícitamente
 *                          (`runAsSystem`): alta de un household, seeds,
 *                          importadores. Se salta el filtro a propósito;
 *   · **sin contexto**   → nadie estableció nada. Es un BUG, y toda consulta
 *                          a una tabla con `householdId` **falla**.
 *
 * Que "sin contexto" reviente en vez de devolver datos es justo lo que impide
 * que un endpoint nuevo se olvide del tenant y exponga el household de otro.
 */
export const TENANT_CONTEXT = Symbol('TENANT_CONTEXT');

export interface TenantScope {
  /** `null` solo en el ámbito de sistema. */
  readonly householdId: string | null;
  /** Quién opera. `null` en el ámbito de sistema (cron, seed). */
  readonly userId: string | null;
  readonly isSystem: boolean;
}

export interface TenantContext {
  /** El ámbito activo, o `undefined` si nadie lo estableció. */
  current(): TenantScope | undefined;

  /** El household activo. Lanza si no hay contexto o si es el de sistema. */
  requireHouseholdId(): string;

  /** Ejecuta `work` con un household activo. */
  runWith<T>(scope: { householdId: string; userId: string }, work: () => Promise<T>): Promise<T>;

  /**
   * Ejecuta `work` SIN household, saltándose el filtro de tenant.
   * Reservado para lo que crea o cruza households: alta de usuario, seeds,
   * importadores. Nunca para atender una petición de un usuario.
   */
  runAsSystem<T>(work: () => Promise<T>): Promise<T>;
}
