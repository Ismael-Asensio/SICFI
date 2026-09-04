/**
 * Base de todo repositorio Prisma.
 *
 * `client` resuelve, de forma transparente para la subclase, si hay una
 * transacción de `PrismaUnitOfWork` en curso: si la hay, la usa; si no, cae al
 * `PrismaService` singleton. Así ningún repositorio necesita saber si se está
 * ejecutando dentro de una unidad de trabajo o no.
 */
import type { PrismaService } from './prisma.service';
import { getActiveTransactionClient, type PrismaTransactionClient } from './prisma-transaction-context';

export abstract class PrismaRepositoryBase {
  protected constructor(protected readonly prisma: PrismaService) {}

  protected get client(): PrismaService | PrismaTransactionClient {
    return getActiveTransactionClient() ?? this.prisma;
  }
}
