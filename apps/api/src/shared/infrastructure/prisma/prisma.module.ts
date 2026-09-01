import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/**
 * Global a propósito: garantiza UNA sola instancia de PrismaClient por proceso.
 * Ver la nota sobre "too many connections" en `PrismaService`.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
