/**
 * Se intentó tocar una tabla con `householdId` sin ningún contexto de tenant.
 *
 * **No es un error de negocio**: es un bug. Significa que hay un camino de
 * código —un endpoint nuevo, un job, un test— que no pasó por
 * `TenantContext.runWith()` ni declaró `runAsSystem()`. Por eso extiende
 * `Error` y no `DomainError`: no hay nada que el usuario pueda corregir, y
 * debe salir como 500 y despertar a alguien, no como un 4xx silencioso.
 *
 * Que esto reviente es la razón de ser de la capa 2: sin la excepción, la
 * consulta se ejecutaría sin filtro y devolvería datos de otros households.
 */
export class MissingTenantError extends Error {
  readonly code = 'MISSING_TENANT_CONTEXT';

  constructor(
    readonly model: string,
    readonly operation: string
  ) {
    super(
      `Se intentó ejecutar ${model}.${operation} sin contexto de tenant. ` +
        'Envuelve la operación en TenantContext.runWith({ householdId, userId }, …), ' +
        'o en runAsSystem(…) si de verdad debe cruzar households.'
    );
    this.name = 'MissingTenantError';
    Object.setPrototypeOf(this, MissingTenantError.prototype);
  }
}
