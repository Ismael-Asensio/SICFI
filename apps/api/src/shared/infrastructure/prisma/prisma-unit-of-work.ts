import { Injectable } from '@nestjs/common';

import type { UnitOfWork } from '../../domain/unit-of-work.port';

import { PrismaService } from './prisma.service';
import { runWithTransactionClient } from './prisma-transaction-context';

@Injectable()
export class PrismaUnitOfWork implements UnitOfWork {
  constructor(private readonly prisma: PrismaService) {}

  run<T>(work: () => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => runWithTransactionClient(tx, work), {
      // El default de Prisma (5 s) basta para una transacción típica de unas
      // pocas escrituras, pero no para una saga como BootstrapUserUseCase:
      // ~40 sentencias secuenciales (24 quincenas + 24 categorías + 7 métodos
      // + fondo) contra el pooler remoto de Supabase pueden superarlo con
      // holgura, y Postgres cierra la transacción a mitad de camino con
      // "Transaction not found" — verificado contra sicfi-dev real.
      maxWait: 10_000,
      timeout: 30_000,
    });
  }
}
