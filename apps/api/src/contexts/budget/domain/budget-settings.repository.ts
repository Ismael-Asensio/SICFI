import type { BudgetSettings } from './budget-settings.entity';

export const BUDGET_SETTINGS_REPOSITORY = Symbol('BUDGET_SETTINGS_REPOSITORY');

export interface BudgetSettingsRepository {
  findByYear(householdId: string, year: number): Promise<BudgetSettings | null>;
  save(settings: BudgetSettings): Promise<void>;
}
