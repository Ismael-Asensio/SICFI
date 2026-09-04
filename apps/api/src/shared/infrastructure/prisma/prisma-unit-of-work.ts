import { Injectable } from '@nestjs/common';

import type { UnitOfWork } from '../../domain/unit-of-work.port';

import { TenantScopedPrisma } from './tenant-scoped-prisma';

/**
 * Delega en `TenantScopedPrisma` para que la transacción salga del cliente
 * YA extendido: así el cliente transaccional conserva el aislamiento por
 * household. Abrir la transacción desde el `PrismaService` crudo dejaría
 * todas las escrituras de la unidad de trabajo sin filtrar.
 */
@Injectable()
export class PrismaUnitOfWork implements UnitOfWork {
  constructor(private readonly scoped: TenantScopedPrisma) {}

  run<T>(work: () => Promise<T>): Promise<T> {
    return this.scoped.runInTransaction(work);
  }
}
