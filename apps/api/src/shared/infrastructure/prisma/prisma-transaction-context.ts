/**
 * Plumbing de transacción para `PrismaUnitOfWork` — no tiene nada que ver con
 * el aislamiento por household (esa es la `tenantExtension` de la Fase 5,
 * pendiente).
 *
 * Un repositorio Prisma necesita saber si hay una transacción en curso para
 * unirse a ella; sin esto, `PrismaUnitOfWork.run()` solo envolvería el trabajo
 * en `$transaction`, pero cada repositorio seguiría usando el cliente normal
 * y las operaciones quedarían fuera de la transacción.
 *
 * `AsyncLocalStorage` propaga el cliente transaccional a través de todo el
 * árbol de llamadas asíncronas de `work()`, sin tener que pasarlo a mano por
 * cada capa.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

import type { Prisma } from '@prisma/client';

export type PrismaTransactionClient = Prisma.TransactionClient;

const storage = new AsyncLocalStorage<PrismaTransactionClient>();

/** El cliente de la transacción activa, o `undefined` si no hay ninguna. */
export function getActiveTransactionClient(): PrismaTransactionClient | undefined {
  return storage.getStore();
}

export function runWithTransactionClient<T>(
  client: PrismaTransactionClient,
  work: () => Promise<T>
): Promise<T> {
  return storage.run(client, work);
}
