import { describe, expect, it } from 'vitest';

import { Currency } from '../../../shared/domain/currency.vo';

import { HouseholdMember } from './household-member.entity';
import { Household } from './household.entity';
import { Profile } from './profile.entity';
import { User } from './user.entity';

describe('User', () => {
  it('guarda el id tal cual llega del sub del JWT', () => {
    const user = new User({ id: 'user-1', email: 'a@b.com' });
    expect(user.id).toBe('user-1');
    expect(user.email).toBe('a@b.com');
  });
});

describe('Household', () => {
  it('guarda la moneda base y la zona horaria', () => {
    const household = new Household({
      id: 'hh-1',
      name: 'Mi hogar',
      baseCurrency: Currency.NIO,
      timezone: 'America/Managua',
    });
    expect(household.baseCurrency.equals(Currency.NIO)).toBe(true);
    expect(household.timezone).toBe('America/Managua');
  });
});

describe('HouseholdMember', () => {
  it('withRole devuelve una instancia nueva con el rol cambiado', () => {
    const member = new HouseholdMember({ id: 'm-1', householdId: 'hh-1', userId: 'user-1', role: 'MEMBER' });
    const promoted = member.withRole('ADMIN');

    expect(promoted.role).toBe('ADMIN');
    expect(promoted.id).toBe(member.id);
    expect(promoted.householdId).toBe(member.householdId);
    expect(promoted.userId).toBe(member.userId);
    // No muta la instancia original.
    expect(member.role).toBe('MEMBER');
  });
});

describe('Profile', () => {
  it('withActiveHousehold cambia el household activo sin tocar el resto', () => {
    const profile = new Profile({
      id: 'p-1',
      userId: 'user-1',
      displayName: 'Ismael',
      locale: 'es-NI',
      timezone: 'America/Managua',
      activeHouseholdId: 'hh-1',
    });

    const switched = profile.withActiveHousehold('hh-2');

    expect(switched.activeHouseholdId).toBe('hh-2');
    expect(switched.displayName).toBe('Ismael');
    expect(profile.activeHouseholdId).toBe('hh-1');
  });

  it('admite no tener ningún household activo todavía', () => {
    const profile = new Profile({
      id: 'p-1',
      userId: 'user-1',
      displayName: 'Ismael',
      locale: 'es-NI',
      timezone: 'America/Managua',
      activeHouseholdId: null,
    });
    expect(profile.activeHouseholdId).toBeNull();
  });
});
