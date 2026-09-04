/**
 * Decoradores de autenticación y autorización.
 *
 * Son **solo metadatos**: quien los interpreta es `JwtAuthGuard`/`RolesGuard`.
 * Viven en `shared` porque los usan los controladores de todos los contextos.
 *
 * ── Los tres niveles de acceso, y por qué son tres y no dos ───────────────
 *
 *   `@Public()`   sin JWT.                    `/health`, y poco más.
 *   `@NoTenant()` con JWT, SIN household.     Alta del usuario, listar mis
 *                                             households, cambiar de household.
 *   (nada)        con JWT Y household activo. **El default**: todo lo demás.
 *
 * El nivel intermedio existe porque hay operaciones legítimas que un usuario
 * autenticado hace ANTES de tener household, o POR ENCIMA de uno concreto.
 * Sin él habría que marcarlas `@Public()` —y quedarían abiertas a cualquiera—
 * o no serían expresables.
 *
 * Que el default sea el más estricto es deliberado: olvidarse de decorar una
 * ruta la deja cerrada, no abierta.
 */
import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { HouseholdRole } from '../../../contexts/iam/domain/household-policy';

export const IS_PUBLIC_KEY = 'sicfi:isPublic';
export const NO_TENANT_KEY = 'sicfi:noTenant';
export const REQUIRED_ROLE_KEY = 'sicfi:requiredRole';

/** Sin JWT. Úsalo con cuentagotas. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/** Con JWT, pero sin exigir household activo. */
export const NoTenant = (): MethodDecorator & ClassDecorator => SetMetadata(NO_TENANT_KEY, true);

/** RN-43: rol mínimo. La jerarquía la resuelve `HouseholdPolicy.isAtLeast`. */
export const RequireRole = (role: HouseholdRole): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_ROLE_KEY, role);

/** Lo que el guard deja en la petición tras verificar el JWT. */
export interface AuthenticatedRequestContext {
  userId: string;
  email: string | null;
  /** `null` en rutas `@NoTenant()`. */
  householdId: string | null;
  /** `null` en rutas `@NoTenant()`. */
  role: HouseholdRole | null;
}

interface RequestWithAuth {
  sicfiAuth?: AuthenticatedRequestContext;
}

function readAuth(context: ExecutionContext): AuthenticatedRequestContext {
  const request = context.switchToHttp().getRequest<RequestWithAuth>();
  if (!request.sicfiAuth) {
    // Solo puede pasar si alguien pide @CurrentUser en una ruta @Public().
    throw new Error(
      'No hay contexto de autenticación en la petición. ' +
        '@CurrentUser/@CurrentHousehold no tienen sentido en una ruta @Public().'
    );
  }
  return request.sicfiAuth;
}

export const CurrentUser = createParamDecorator((_: unknown, context: ExecutionContext) =>
  readAuth(context)
);

/** El household activo. Lanza en rutas `@NoTenant()`, donde no hay ninguno. */
export const CurrentHousehold = createParamDecorator((_: unknown, context: ExecutionContext) => {
  const auth = readAuth(context);
  if (!auth.householdId) {
    throw new Error('Esta ruta está marcada @NoTenant(): no hay household activo que inyectar.');
  }
  return auth.householdId;
});
