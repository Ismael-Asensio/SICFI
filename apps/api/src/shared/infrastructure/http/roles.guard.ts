/**
 * `RolesGuard` — RN-43.
 *
 * El aislamiento por household responde "¿puedes ver estos datos?"; el rol
 * responde "¿puedes modificarlos?". Son fallos distintos y necesitan
 * comprobaciones distintas: un miembro legítimo de un household puede tener
 * todo el derecho a LEER y ninguno a BORRAR.
 *
 * La jerarquía no se reimplementa aquí: la resuelve `HouseholdPolicy`, que ya
 * está probada en el dominio sin tocar HTTP.
 *
 * La comprobación de PROPIEDAD (un `MEMBER` solo edita sus movimientos) NO vive
 * en este guard: depende de la fila concreta, así que hay que leerla primero.
 * Es una regla de negocio y la aplica el caso de uso con
 * `HouseholdPolicy.canModifyTransaction`.
 */
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { HouseholdPolicy, type HouseholdRole } from '../../../contexts/iam/domain/household-policy';

import { REQUIRED_ROLE_KEY, type AuthenticatedRequestContext } from './auth.decorators';

interface RequestLike {
  sicfiAuth?: AuthenticatedRequestContext;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<HouseholdRole | undefined>(
      REQUIRED_ROLE_KEY,
      [context.getHandler(), context.getClass()]
    );
    if (!required) return true;

    const auth = context.switchToHttp().getRequest<RequestLike>().sicfiAuth;
    if (!auth?.role) {
      // Marcar @RequireRole en una ruta @Public() o @NoTenant() no tiene
      // sentido: no hay rol que comprobar. Es un error de programación.
      throw new ForbiddenException(
        'Esta ruta exige un rol pero no tiene household resuelto. ' +
          'Revisa que no esté marcada @Public() o @NoTenant().'
      );
    }

    if (!HouseholdPolicy.isAtLeast(auth.role, required)) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_ROLE',
        message: `Esta operación exige el rol ${required} o superior; el tuyo es ${auth.role}.`,
      });
    }

    return true;
  }
}
