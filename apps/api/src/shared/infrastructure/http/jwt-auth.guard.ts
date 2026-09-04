/**
 * `JwtAuthGuard` — capa 1 de la triple defensa (CLAUDE.md §7).
 *
 * Global: **toda** ruta exige JWT salvo que esté marcada `@Public()`. Que el
 * default sea cerrado es el punto: olvidarse de decorar una ruta nueva la deja
 * protegida, no abierta.
 *
 * Además de autenticar, es quien **resuelve el tenant**: del `sub` del JWT saca
 * la membresía y rellena el ámbito que abrió `TenantContextMiddleware`. A
 * partir de ahí, la `tenantExtension` filtra sola cada consulta (capa 2).
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { HouseholdRole } from '../../../contexts/iam/domain/household-policy';
import type { HouseholdMemberRepository } from '../../../contexts/iam/domain/household-member.repository';
import type { ProfileRepository } from '../../../contexts/iam/domain/profile.repository';
import { JwtVerifier } from '../auth/jwt-verifier';
import { AsyncLocalTenantContext } from '../tenant/async-local-tenant-context';

import { IS_PUBLIC_KEY, NO_TENANT_KEY, type AuthenticatedRequestContext } from './auth.decorators';

interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  sicfiAuth?: AuthenticatedRequestContext;
}

export const HOUSEHOLD_MEMBER_REPOSITORY_FOR_AUTH = Symbol('HOUSEHOLD_MEMBER_REPOSITORY_FOR_AUTH');
export const PROFILE_REPOSITORY_FOR_AUTH = Symbol('PROFILE_REPOSITORY_FOR_AUTH');

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: JwtVerifier,
    private readonly tenant: AsyncLocalTenantContext,
    private readonly profiles: ProfileRepository,
    private readonly members: HouseholdMemberRepository
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.hasMetadata(IS_PUBLIC_KEY, context)) return true;

    const request = context.switchToHttp().getRequest<RequestLike>();
    const token = this.extractBearer(request);
    if (!token) throw new UnauthorizedException('Falta el token de acceso');

    const verified = await this.verifier.verify(token);
    if (!verified) throw new UnauthorizedException('Token de acceso inválido');

    if (this.hasMetadata(NO_TENANT_KEY, context)) {
      request.sicfiAuth = {
        userId: verified.userId,
        email: verified.email,
        householdId: null,
        role: null,
      };
      return true;
    }

    const membership = await this.resolveActiveMembership(verified.userId);
    if (!membership) {
      // El usuario existe en Supabase Auth pero aún no tiene household. No es
      // un 401 (el token es bueno) ni un 500: le falta el alta.
      throw new ForbiddenException({
        code: 'USER_NOT_PROVISIONED',
        message:
          'Este usuario todavía no tiene household. Llama a POST /api/v1/auth/bootstrap ' +
          'para crear el suyo antes de usar el resto de la API.',
      });
    }

    // A partir de aquí la extensión de Prisma filtra por este household.
    this.tenant.resolve({ householdId: membership.householdId, userId: verified.userId });

    request.sicfiAuth = {
      userId: verified.userId,
      email: verified.email,
      householdId: membership.householdId,
      role: membership.role,
    };
    return true;
  }

  /**
   * "¿A qué household entra este usuario?" es, por definición, una pregunta que
   * cruza households, así que se responde en ámbito de sistema — es justo para
   * lo que existe `runAsSystem`.
   *
   * Se prefiere el `activeHouseholdId` del perfil (RN-42), pero **solo si el
   * usuario sigue siendo miembro**: si lo expulsaron, ese id quedó obsoleto y
   * honrarlo daría acceso a un household del que ya no forma parte.
   */
  private resolveActiveMembership(
    userId: string
  ): Promise<{ householdId: string; role: HouseholdRole } | null> {
    return this.tenant.runAsSystem(async () => {
      const memberships = await this.members.findByUserAcrossHouseholds(userId);
      if (memberships.length === 0) return null;

      const profile = await this.profiles.findByUserId(userId);
      const preferred = profile?.activeHouseholdId
        ? memberships.find(member => member.householdId === profile.activeHouseholdId)
        : undefined;

      const chosen = preferred ?? memberships[0];
      if (!chosen) return null;

      return { householdId: chosen.householdId, role: chosen.role };
    });
  }

  private hasMetadata(key: string, context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(key, [context.getHandler(), context.getClass()]) ===
      true
    );
  }

  private extractBearer(request: RequestLike): string | null {
    const header = request.headers.authorization;
    const value = Array.isArray(header) ? header[0] : header;
    if (!value) return null;

    const [scheme, token] = value.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
    return token;
  }
}
