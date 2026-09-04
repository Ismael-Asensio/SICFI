/**
 * Adaptadores transversales: reloj, generador de ids, contexto de tenant,
 * unidad de trabajo y el cliente Prisma con aislamiento.
 *
 * Global porque lo necesita todo contexto; exporta los TOKENS, no las clases,
 * para que nadie fuera de aquí dependa de un adaptador concreto.
 */
import { Global, Module } from '@nestjs/common';

import { CLOCK } from './domain/clock.port';
import { EXCHANGE_RATE_PROVIDER } from './domain/exchange-rate-provider.port';
import { ID_GENERATOR } from './domain/id-generator.port';
import { TENANT_CONTEXT } from './domain/tenant-context.port';
import { UNIT_OF_WORK } from './domain/unit-of-work.port';
import { JwtVerifier } from './infrastructure/auth/jwt-verifier';
import { SystemClockAdapter } from './infrastructure/clock/system-clock.adapter';
import { RandomIdGenerator } from './infrastructure/id/random-id-generator.adapter';
import { PrismaExchangeRateAdapter } from './infrastructure/prisma/prisma-exchange-rate.adapter';
import { PrismaUnitOfWork } from './infrastructure/prisma/prisma-unit-of-work';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { PrismaService } from './infrastructure/prisma/prisma.service';
import { TenantScopedPrisma } from './infrastructure/prisma/tenant-scoped-prisma';
import { AsyncLocalTenantContext } from './infrastructure/tenant/async-local-tenant-context';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    AsyncLocalTenantContext,
    { provide: TENANT_CONTEXT, useExisting: AsyncLocalTenantContext },

    {
      // El cliente extendido se construye una vez, con el contexto de tenant
      // ya inyectado: la extensión lee el ámbito activo en cada consulta.
      provide: TenantScopedPrisma,
      inject: [PrismaService, AsyncLocalTenantContext],
      useFactory: (prisma: PrismaService, tenant: AsyncLocalTenantContext) =>
        new TenantScopedPrisma(prisma, tenant),
    },

    { provide: CLOCK, useClass: SystemClockAdapter },
    { provide: ID_GENERATOR, useClass: RandomIdGenerator },
    { provide: UNIT_OF_WORK, useClass: PrismaUnitOfWork },
    { provide: EXCHANGE_RATE_PROVIDER, useClass: PrismaExchangeRateAdapter },

    JwtVerifier,
  ],
  exports: [
    TENANT_CONTEXT,
    CLOCK,
    ID_GENERATOR,
    UNIT_OF_WORK,
    EXCHANGE_RATE_PROVIDER,
    TenantScopedPrisma,
    AsyncLocalTenantContext,
    JwtVerifier,
    PrismaModule,
  ],
})
export class SharedKernelModule {}
