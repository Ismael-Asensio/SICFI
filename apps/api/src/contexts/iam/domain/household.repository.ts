import type { Household } from './household.entity';

export const HOUSEHOLD_REPOSITORY = Symbol('HOUSEHOLD_REPOSITORY');

/**
 * El propio `Household` es la raíz del árbol de tenant, así que sus métodos se
 * indexan por su propio `id`, no por un `householdId` externo.
 */
export interface HouseholdRepository {
  findById(id: string): Promise<Household | null>;
  save(household: Household): Promise<void>;
}
