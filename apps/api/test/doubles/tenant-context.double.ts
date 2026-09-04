import type { TenantContext, TenantScope } from '../../src/shared/domain/tenant-context.port';

/**
 * `TenantContext` en memoria para tests con dobles.
 *
 * Los repositorios en memoria no filtran por household —lo hace la
 * `tenantExtension` de Prisma, que aquí no interviene—, así que este doble se
 * limita a ejecutar el trabajo. Guarda el ámbito activo para que un test pueda
 * comprobar EN QUÉ ámbito se ejecutó algo, que es justo lo interesante de
 * `BootstrapUserUseCase`: abre en modo sistema y cierra en modo household.
 */
export class FakeTenantContext implements TenantContext {
  private scope: TenantScope | undefined;

  /** Ámbitos por los que pasó, en orden. Útil para aserciones. */
  readonly seen: TenantScope[] = [];

  current(): TenantScope | undefined {
    return this.scope;
  }

  requireHouseholdId(): string {
    if (!this.scope || this.scope.householdId === null) {
      throw new Error('No hay household activo en el contexto.');
    }
    return this.scope.householdId;
  }

  async runWith<T>(
    scope: { householdId: string; userId: string },
    work: () => Promise<T>
  ): Promise<T> {
    return this.enter({ ...scope, isSystem: false }, work);
  }

  async runAsSystem<T>(work: () => Promise<T>): Promise<T> {
    return this.enter({ householdId: null, userId: null, isSystem: true }, work);
  }

  private async enter<T>(scope: TenantScope, work: () => Promise<T>): Promise<T> {
    const previous = this.scope;
    this.scope = scope;
    this.seen.push(scope);
    try {
      return await work();
    } finally {
      this.scope = previous;
    }
  }
}
