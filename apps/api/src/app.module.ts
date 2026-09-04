import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BudgetModule } from './contexts/budget/budget.module';
import { CatalogModule } from './contexts/catalog/catalog.module';
import {
  HOUSEHOLD_MEMBER_REPOSITORY,
  type HouseholdMemberRepository,
} from './contexts/iam/domain/household-member.repository';
import {
  PROFILE_REPOSITORY,
  type ProfileRepository,
} from './contexts/iam/domain/profile.repository';
import { IamModule } from './contexts/iam/iam.module';
import { JwtVerifier } from './shared/infrastructure/auth/jwt-verifier';
import { JwtAuthGuard } from './shared/infrastructure/http/jwt-auth.guard';
import { RolesGuard } from './shared/infrastructure/http/roles.guard';
import { TenantContextMiddleware } from './shared/infrastructure/http/tenant-context.middleware';
import { UserAwareThrottlerGuard } from './shared/infrastructure/http/user-aware-throttler.guard';
import { AsyncLocalTenantContext } from './shared/infrastructure/tenant/async-local-tenant-context';
import { SharedKernelModule } from './shared/shared-kernel.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: Number(config.get('THROTTLE_TTL_SECONDS') ?? 60) * 1000,
          limit: Number(config.get('THROTTLE_LIMIT') ?? 100),
        },
      ],
    }),
    SharedKernelModule,
    CatalogModule,
    BudgetModule,
    IamModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    TenantContextMiddleware,
    {
      // Global: TODA ruta exige JWT salvo `@Public()`. Olvidarse de decorar
      // una ruta nueva la deja protegida, no abierta.
      provide: APP_GUARD,
      inject: [
        Reflector,
        JwtVerifier,
        AsyncLocalTenantContext,
        PROFILE_REPOSITORY,
        HOUSEHOLD_MEMBER_REPOSITORY,
      ],
      useFactory: (
        reflector: Reflector,
        verifier: JwtVerifier,
        tenant: AsyncLocalTenantContext,
        profiles: ProfileRepository,
        members: HouseholdMemberRepository
      ) => new JwtAuthGuard(reflector, verifier, tenant, profiles, members),
    },
    // Se registra DESPUÉS del de autenticación: cuando corre, el rol ya está
    // resuelto en la petición.
    { provide: APP_GUARD, useClass: RolesGuard },
    // Y este el ÚLTIMO, también a propósito: necesita `request.sicfiAuth` para
    // contar por usuario en vez de por IP, y eso solo existe después de que
    // `JwtAuthGuard` haya verificado el token.
    //
    // El precio es que una avalancha de tokens inválidos no pasa por aquí: se
    // queda en el 401 del guard anterior. Se acepta porque ese camino es barato
    // —jose cachea el JWKS y ni siquiera toca la base— mientras que lo caro y
    // lo que de verdad hay que proteger (dar de alta un usuario, que crea 24
    // quincenas y siembra catálogos; emitir invitaciones) está detrás de un JWT
    // válido y sí queda cubierto.
    { provide: APP_GUARD, useClass: UserAwareThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Abre el ámbito de tenant para toda petición, antes que cualquier guard.
    consumer.apply(TenantContextMiddleware).forRoutes('*');
  }
}
