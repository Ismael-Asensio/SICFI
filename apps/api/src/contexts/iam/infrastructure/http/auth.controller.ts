/**
 * Rutas de sesión y alta. Todas `@NoTenant()`: hacen falta ANTES de que el
 * usuario tenga un household activo, o precisamente para elegirlo.
 */
import { Body, Controller, Get, HttpCode, Inject, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { CalendarDate } from '../../../../shared/domain/calendar-date.vo';
import type { Clock } from '../../../../shared/domain/clock.port';
import { CLOCK } from '../../../../shared/domain/clock.port';
import { Currency } from '../../../../shared/domain/currency.vo';
import {
  CurrentUser,
  NoTenant,
  type AuthenticatedRequestContext,
} from '../../../../shared/infrastructure/http/auth.decorators';
import { AcceptInviteUseCase } from '../../application/use-cases/accept-invite.use-case';
import { BootstrapUserUseCase } from '../../application/use-cases/bootstrap-user.use-case';
import { ListMyHouseholdsUseCase } from '../../application/use-cases/list-my-households.use-case';
import { SwitchActiveHouseholdUseCase } from '../../application/use-cases/switch-active-household.use-case';
import { toHttpException } from '../../../../shared/infrastructure/http/domain-error.mapper';

const DEFAULT_TIMEZONE = 'America/Managua';

@Controller('auth')
@NoTenant()
export class AuthController {
  constructor(
    private readonly bootstrap: BootstrapUserUseCase,
    private readonly listHouseholds: ListMyHouseholdsUseCase,
    private readonly switchHousehold: SwitchActiveHouseholdUseCase,
    private readonly acceptInvite: AcceptInviteUseCase,
    @Inject(CLOCK) private readonly clock: Clock
  ) {}

  /** Quién soy y a qué households pertenezco. */
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedRequestContext) {
    return {
      userId: user.userId,
      email: user.email,
      households: await this.listHouseholds.execute(user.userId),
    };
  }

  /**
   * Alta idempotente. La llama el frontend tras el registro; puede repetirse
   * sin efecto si el usuario ya tiene household.
   *
   * No se hace automáticamente dentro del guard a propósito: es una escritura
   * de decenas de filas, y dispararla desde cualquier petición dejaría varias
   * altas compitiendo en el primer render de la app.
   */
  @Post('bootstrap')
  @HttpCode(200)
  // Escribe decenas de filas. Es idempotente —reintentar tras un fallo de red
  // es legítimo— pero nadie necesita darse de alta 5 veces por minuto.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async bootstrapUser(
    @CurrentUser() user: AuthenticatedRequestContext,
    @Body() body: { householdName?: string; timezone?: string }
  ) {
    const today = this.clock.today(body.timezone ?? DEFAULT_TIMEZONE);

    const result = await this.bootstrap.execute({
      userId: user.userId,
      email: user.email ?? `${user.userId}@sin-email.local`,
      displayName: user.email ?? 'Usuario',
      householdName: body.householdName?.trim() || 'Mi hogar',
      baseCurrency: Currency.NIO,
      timezone: body.timezone ?? DEFAULT_TIMEZONE,
      year: today.year,
      controlStartDate: CalendarDate.unsafe(today.year, today.month, today.day),
    });

    if (!result.ok) throw toHttpException(result.error);

    return {
      householdId: result.value.household.id,
      name: result.value.household.name,
      periods: result.value.periods.length,
    };
  }

  /** Cambia el household activo (RN-42). Solo entre los que ya eres miembro. */
  @Post('active-household')
  @HttpCode(200)
  async setActiveHousehold(
    @CurrentUser() user: AuthenticatedRequestContext,
    @Body() body: { householdId: string }
  ) {
    const result = await this.switchHousehold.execute({
      userId: user.userId,
      householdId: body.householdId,
    });
    if (!result.ok) throw toHttpException(result.error);

    return { activeHouseholdId: result.value.activeHouseholdId };
  }

  /** Aceptar una invitación: por definición cruza households. */
  // Aceptar una invitación consume un token. Un límite bajo es lo que impide
  // que alguien pruebe tokens a lo bruto hasta acertar uno.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('invites/accept')
  @HttpCode(200)
  async accept(@CurrentUser() user: AuthenticatedRequestContext, @Body() body: { token: string }) {
    const result = await this.acceptInvite.execute({
      token: body.token,
      userId: user.userId,
      email: user.email ?? '',
    });
    if (!result.ok) throw toHttpException(result.error);

    return { householdId: result.value.householdId, role: result.value.member.role };
  }
}
