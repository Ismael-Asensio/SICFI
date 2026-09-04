/**
 * El cliente Prisma que usan TODOS los repositorios.
 *
 * Une las dos piezas que deciden "contra qué ejecuto esta consulta":
 *
 *   1. **Aislamiento de tenant** — el cliente lleva aplicada la
 *      `tenantExtension`, así que cada consulta se filtra por `householdId`
 *      aunque el repositorio no lo pida.
 *   2. **Transacción activa** — si hay una `PrismaUnitOfWork` en curso, se usa
 *      su cliente transaccional; si no, el normal. Verificado contra Prisma 6:
 *      las extensiones **sobreviven** dentro de `$transaction`, así que el
 *      cliente transaccional sigue estando aislado por tenant.
 *
 * Que `PrismaRepositoryBase` dependa de esta clase y no de `PrismaService` es
 * deliberado: hace **imposible por tipos** construir un repositorio con un
 * cliente sin aislar.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';

import type { TenantContext } from '../../domain/tenant-context.port';

import { PrismaService } from './prisma.service';
import { tenantExtension } from './tenant.extension';

function buildScopedClient(prisma: PrismaService, tenant: TenantContext) {
  return prisma.$extends(tenantExtension(tenant));
}

type ScopedPrismaClient = ReturnType<typeof buildScopedClient>;

/**
 * Lo que un repositorio necesita: los delegados de modelo, nada más.
 * Tanto el cliente completo como el transaccional encajan aquí, y ninguno
 * expone `$transaction` ni `$extends` — un repositorio no tiene por qué
 * abrir transacciones ni volver a extender el cliente.
 */
export type TenantScopedClient = Pick<
  ScopedPrismaClient,
  | 'user'
  | 'profile'
  | 'household'
  | 'householdMember'
  | 'householdInvite'
  | 'budgetSettings'
  | 'category'
  | 'paymentMethod'
  | 'savingsFund'
  | 'exchangeRate'
  | 'period'
  | 'recurringExpense'
  | 'transaction'
  | 'auditLog'
>;

/**
 * Cliente de la transacción en curso. Es plomería de `$transaction`, sin
 * relación con el aislamiento por household: responde "¿qué cliente?", no
 * "¿de quién son estos datos?".
 */
const transactionStorage = new AsyncLocalStorage<TenantScopedClient>();

@Injectable()
export class TenantScopedPrisma {
  private readonly scoped: ScopedPrismaClient;

  constructor(prisma: PrismaService, tenant: TenantContext) {
    this.scoped = buildScopedClient(prisma, tenant);
  }

  /** El cliente activo: el de la transacción si la hay, el normal si no. */
  get client(): TenantScopedClient {
    return transactionStorage.getStore() ?? this.scoped;
  }

  /** Ejecuta `work` dentro de una transacción; la usa `PrismaUnitOfWork`. */
  runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    return this.scoped.$transaction((tx) => transactionStorage.run(tx, work), {
      // El default de Prisma (5 s) no alcanza para una saga como
      // BootstrapUserUseCase: ~40 sentencias secuenciales contra el pooler
      // remoto lo superan y Postgres cierra la transacción a mitad con
      // "Transaction not found" — comprobado contra sicfi-dev.
      maxWait: 10_000,
      timeout: 30_000,
    });
  }
}
