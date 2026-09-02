import { describe, expect, it } from 'vitest';

import { HouseholdPolicy, type HouseholdAction, type HouseholdRole } from './household-policy';

const ROLES: HouseholdRole[] = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'];

describe('HouseholdPolicy — matriz de permisos (RN-43)', () => {
  it('todos los roles pueden leer', () => {
    const readActions: HouseholdAction[] = ['transaction:read', 'catalog:read', 'settings:read'];
    for (const role of ROLES) {
      for (const action of readActions) {
        expect(HouseholdPolicy.can(role, action)).toBe(true);
      }
    }
  });

  it('un VIEWER no puede escribir nada', () => {
    const writeActions: HouseholdAction[] = [
      'transaction:create',
      'transaction:update',
      'transaction:delete',
      'catalog:write',
      'settings:write',
      'member:invite',
      'member:remove',
      'member:change-role',
      'household:delete',
    ];
    for (const action of writeActions) {
      expect(HouseholdPolicy.can('VIEWER', action)).toBe(false);
    }
  });

  it('un MEMBER crea movimientos pero solo lee catálogos y settings', () => {
    expect(HouseholdPolicy.can('MEMBER', 'transaction:create')).toBe(true);
    expect(HouseholdPolicy.can('MEMBER', 'catalog:write')).toBe(false);
    expect(HouseholdPolicy.can('MEMBER', 'settings:write')).toBe(false);
    expect(HouseholdPolicy.can('MEMBER', 'member:invite')).toBe(false);
  });

  it('un ADMIN gestiona catálogos y miembros pero no borra el household', () => {
    expect(HouseholdPolicy.can('ADMIN', 'catalog:write')).toBe(true);
    expect(HouseholdPolicy.can('ADMIN', 'settings:write')).toBe(true);
    expect(HouseholdPolicy.can('ADMIN', 'member:invite')).toBe(true);
    expect(HouseholdPolicy.can('ADMIN', 'member:remove')).toBe(true);
    expect(HouseholdPolicy.can('ADMIN', 'member:change-role')).toBe(false);
    expect(HouseholdPolicy.can('ADMIN', 'household:delete')).toBe(false);
  });

  it('solo el OWNER cambia roles y borra el household', () => {
    expect(HouseholdPolicy.can('OWNER', 'member:change-role')).toBe(true);
    expect(HouseholdPolicy.can('OWNER', 'household:delete')).toBe(true);
    for (const role of ['ADMIN', 'MEMBER', 'VIEWER'] as HouseholdRole[]) {
      expect(HouseholdPolicy.can(role, 'household:delete')).toBe(false);
    }
  });

  it('ensureCan devuelve un ForbiddenError explicativo', () => {
    const result = HouseholdPolicy.ensureCan('MEMBER', 'household:delete');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('FORBIDDEN');
      expect(result.error.details.role).toBe('MEMBER');
    }
  });

  it('respeta la jerarquía OWNER > ADMIN > MEMBER > VIEWER', () => {
    expect(HouseholdPolicy.isAtLeast('OWNER', 'ADMIN')).toBe(true);
    expect(HouseholdPolicy.isAtLeast('ADMIN', 'ADMIN')).toBe(true);
    expect(HouseholdPolicy.isAtLeast('MEMBER', 'ADMIN')).toBe(false);
    expect(HouseholdPolicy.isAtLeast('VIEWER', 'MEMBER')).toBe(false);
  });
});

describe('HouseholdPolicy — propiedad de los movimientos (RN-43)', () => {
  const own = { actingUserId: 'user-a', transactionCreatedByUserId: 'user-a' };
  const other = { actingUserId: 'user-a', transactionCreatedByUserId: 'user-b' };

  it('un MEMBER edita los suyos pero no los de otro', () => {
    expect(HouseholdPolicy.canModifyTransaction({ role: 'MEMBER', ...own })).toBe(true);
    expect(HouseholdPolicy.canModifyTransaction({ role: 'MEMBER', ...other })).toBe(false);
  });

  it('un ADMIN y un OWNER editan los de cualquiera', () => {
    expect(HouseholdPolicy.canModifyTransaction({ role: 'ADMIN', ...other })).toBe(true);
    expect(HouseholdPolicy.canModifyTransaction({ role: 'OWNER', ...other })).toBe(true);
  });

  it('un VIEWER no edita ni los suyos', () => {
    expect(HouseholdPolicy.canModifyTransaction({ role: 'VIEWER', ...own })).toBe(false);
  });

  it('el mensaje distingue el caso VIEWER del caso MEMBER', () => {
    const viewer = HouseholdPolicy.ensureCanModifyTransaction({ role: 'VIEWER', ...own });
    const member = HouseholdPolicy.ensureCanModifyTransaction({ role: 'MEMBER', ...other });

    expect(viewer.ok).toBe(false);
    expect(member.ok).toBe(false);
    if (!viewer.ok) expect(viewer.error.message).toContain('VIEWER');
    if (!member.ok) expect(member.error.message).toContain('MEMBER');
  });
});

describe('HouseholdPolicy — expulsar miembros (RN-43)', () => {
  it('un ADMIN no puede expulsar al OWNER', () => {
    const result = HouseholdPolicy.ensureCanRemoveMember({
      actorRole: 'ADMIN',
      targetRole: 'OWNER',
    });
    expect(result.ok).toBe(false);
  });

  it('un ADMIN puede expulsar a un MEMBER o a otro ADMIN', () => {
    expect(
      HouseholdPolicy.ensureCanRemoveMember({ actorRole: 'ADMIN', targetRole: 'MEMBER' }).ok
    ).toBe(true);
    expect(
      HouseholdPolicy.ensureCanRemoveMember({ actorRole: 'ADMIN', targetRole: 'ADMIN' }).ok
    ).toBe(true);
  });

  it('un MEMBER no puede expulsar a nadie', () => {
    expect(
      HouseholdPolicy.ensureCanRemoveMember({ actorRole: 'MEMBER', targetRole: 'VIEWER' }).ok
    ).toBe(false);
  });
});

describe('HouseholdPolicy — el último OWNER (RN-44)', () => {
  it('el último OWNER no puede abandonar el household', () => {
    // Caso borde que el plan exige explícitamente.
    const result = HouseholdPolicy.ensureOwnerRemains({
      memberRole: 'OWNER',
      ownerCount: 1,
      operation: 'leave',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.details.rule).toBe('RN-44');
      expect(result.error.message).toContain('Transfiere antes la propiedad');
    }
  });

  it('el último OWNER tampoco puede degradarse', () => {
    expect(
      HouseholdPolicy.ensureOwnerRemains({
        memberRole: 'OWNER',
        ownerCount: 1,
        operation: 'demote',
      }).ok
    ).toBe(false);
  });

  it('con dos OWNER, uno sí puede salir', () => {
    expect(
      HouseholdPolicy.ensureOwnerRemains({
        memberRole: 'OWNER',
        ownerCount: 2,
        operation: 'leave',
      }).ok
    ).toBe(true);
  });

  it('un miembro que no es OWNER siempre puede salir', () => {
    for (const role of ['ADMIN', 'MEMBER', 'VIEWER'] as HouseholdRole[]) {
      expect(
        HouseholdPolicy.ensureOwnerRemains({ memberRole: role, ownerCount: 1, operation: 'leave' })
          .ok
      ).toBe(true);
    }
  });
});
