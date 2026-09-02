/**
 * `HouseholdPolicy` — RN-43 y RN-44.
 *
 * Dos preguntas que conviene no confundir:
 *   · el `householdId` responde **"¿puedes ver estos datos?"** (aislamiento);
 *   · el rol responde **"¿puedes modificarlos?"** (autorización).
 *
 * Esto es dominio puro: sin Nest, sin HTTP, sin decoradores. El `RolesGuard` de
 * la Fase 6 lo consulta, pero la regla vive aquí y se prueba sin levantar nada.
 * La comprobación de propiedad (`createdByUserId === userId`) es una regla de
 * negocio, no de transporte, y por eso también está aquí.
 */
import { ForbiddenError, BusinessRuleError, type DomainError } from '../../../shared/domain/domain-error';
import { err, ok, type Result } from '../../../shared/domain/result';

export type HouseholdRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

export type HouseholdAction =
  | 'transaction:read'
  | 'transaction:create'
  | 'transaction:update'
  | 'transaction:delete'
  | 'catalog:read'
  | 'catalog:write'
  | 'settings:read'
  | 'settings:write'
  | 'member:invite'
  | 'member:remove'
  | 'member:change-role'
  | 'household:delete';

/** Jerarquía. Un número mayor incluye las capacidades del menor. */
const RANK: Readonly<Record<HouseholdRole, number>> = {
  OWNER: 4,
  ADMIN: 3,
  MEMBER: 2,
  VIEWER: 1,
};

/**
 * Acciones permitidas **sin condiciones** por rol.
 *
 * `transaction:update` y `transaction:delete` no están en MEMBER a propósito:
 * un MEMBER solo puede tocar los suyos, y eso depende de quién creó el
 * movimiento. Lo resuelve `canModifyTransaction`.
 */
const MATRIX: Readonly<Record<HouseholdRole, ReadonlySet<HouseholdAction>>> = {
  VIEWER: new Set<HouseholdAction>(['transaction:read', 'catalog:read', 'settings:read']),

  MEMBER: new Set<HouseholdAction>([
    'transaction:read',
    'transaction:create',
    'catalog:read',
    'settings:read',
  ]),

  ADMIN: new Set<HouseholdAction>([
    'transaction:read',
    'transaction:create',
    'transaction:update',
    'transaction:delete',
    'catalog:read',
    'catalog:write',
    'settings:read',
    'settings:write',
    'member:invite',
    'member:remove',
  ]),

  OWNER: new Set<HouseholdAction>([
    'transaction:read',
    'transaction:create',
    'transaction:update',
    'transaction:delete',
    'catalog:read',
    'catalog:write',
    'settings:read',
    'settings:write',
    'member:invite',
    'member:remove',
    'member:change-role',
    'household:delete',
  ]),
};

export class HouseholdPolicy {
  static can(role: HouseholdRole, action: HouseholdAction): boolean {
    return MATRIX[role].has(action);
  }

  static ensureCan(role: HouseholdRole, action: HouseholdAction): Result<void, DomainError> {
    return HouseholdPolicy.can(role, action)
      ? ok()
      : err(
          new ForbiddenError(`El rol ${role} no puede realizar la acción "${action}"`, {
            role,
            action,
          })
        );
  }

  static isAtLeast(role: HouseholdRole, minimum: HouseholdRole): boolean {
    return RANK[role] >= RANK[minimum];
  }

  /**
   * RN-43 — edición y borrado de movimientos.
   *
   * `ADMIN` y `OWNER` pueden con cualquiera; `MEMBER` solo con los suyos;
   * `VIEWER` con ninguno.
   */
  static canModifyTransaction(params: {
    role: HouseholdRole;
    actingUserId: string;
    transactionCreatedByUserId: string;
  }): boolean {
    const { role, actingUserId, transactionCreatedByUserId } = params;

    if (role === 'VIEWER') return false;
    if (HouseholdPolicy.isAtLeast(role, 'ADMIN')) return true;
    return actingUserId === transactionCreatedByUserId;
  }

  static ensureCanModifyTransaction(params: {
    role: HouseholdRole;
    actingUserId: string;
    transactionCreatedByUserId: string;
  }): Result<void, DomainError> {
    return HouseholdPolicy.canModifyTransaction(params)
      ? ok()
      : err(
          new ForbiddenError(
            params.role === 'VIEWER'
              ? 'Un VIEWER no puede modificar movimientos'
              : 'Un MEMBER solo puede modificar los movimientos que ha creado',
            { role: params.role }
          )
        );
  }

  /**
   * RN-43 — un ADMIN no puede expulsar a un OWNER.
   * Sin esta regla, cualquier ADMIN podría descabezar el household.
   */
  static ensureCanRemoveMember(params: {
    actorRole: HouseholdRole;
    targetRole: HouseholdRole;
  }): Result<void, DomainError> {
    const { actorRole, targetRole } = params;

    const permitted = HouseholdPolicy.ensureCan(actorRole, 'member:remove');
    if (!permitted.ok) return permitted;

    if (targetRole === 'OWNER' && actorRole !== 'OWNER') {
      return err(
        new ForbiddenError('Un ADMIN no puede expulsar al OWNER del household', {
          actorRole,
          targetRole,
        })
      );
    }

    return ok();
  }

  /**
   * RN-44 — un household siempre conserva exactamente un OWNER.
   *
   * El último OWNER no puede abandonarlo ni degradarse: dejaría un presupuesto
   * compartido sin nadie capaz de gestionar miembros ni borrarlo. Transferir la
   * propiedad es una operación explícita y previa.
   */
  static ensureOwnerRemains(params: {
    memberRole: HouseholdRole;
    ownerCount: number;
    operation: 'leave' | 'demote' | 'remove';
  }): Result<void, DomainError> {
    const { memberRole, ownerCount, operation } = params;

    if (memberRole !== 'OWNER' || ownerCount > 1) return ok();

    const wording: Record<typeof operation, string> = {
      leave: 'abandonar el household',
      demote: 'cambiar su propio rol',
      remove: 'ser expulsado',
    };

    return err(
      new BusinessRuleError(
        'RN-44',
        `El último OWNER no puede ${wording[operation]}. ` +
          'Transfiere antes la propiedad a otro miembro.',
        { operation, ownerCount }
      )
    );
  }
}
