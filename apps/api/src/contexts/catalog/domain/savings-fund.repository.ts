import type { SavingsFund } from './savings-fund.entity';

export const SAVINGS_FUND_REPOSITORY = Symbol('SAVINGS_FUND_REPOSITORY');

export interface SavingsFundRepository {
  findById(householdId: string, id: string): Promise<SavingsFund | null>;
  findByName(householdId: string, name: string): Promise<SavingsFund | null>;
  findMany(householdId: string, options?: { activeOnly?: boolean }): Promise<SavingsFund[]>;
  save(fund: SavingsFund): Promise<void>;
}
