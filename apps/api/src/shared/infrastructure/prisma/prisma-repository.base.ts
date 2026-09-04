/**
 * Base de todo repositorio Prisma.
 *
 * Depende de `TenantScopedPrisma`, **nunca** de `PrismaService` a secas: eso
 * hace imposible por tipos construir un repositorio con un cliente sin
 * aislamiento de tenant. El getter `client` resuelve además, de forma
 * transparente, si hay una transacción en curso.
 */
import type { TenantScopedClient, TenantScopedPrisma } from './tenant-scoped-prisma';

export abstract class PrismaRepositoryBase {
  protected constructor(private readonly scoped: TenantScopedPrisma) {}

  protected get client(): TenantScopedClient {
    return this.scoped.client;
  }
}
