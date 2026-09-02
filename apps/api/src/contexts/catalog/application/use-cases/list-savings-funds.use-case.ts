import type { SavingsFund } from '../../domain/savings-fund.entity';
import type { SavingsFundRepository } from '../../domain/savings-fund.repository';

export interface ListSavingsFundsQuery {
  householdId: string;
  activeOnly?: boolean;
}

export class ListSavingsFundsUseCase {
  constructor(private readonly funds: SavingsFundRepository) {}

  execute(query: ListSavingsFundsQuery): Promise<SavingsFund[]> {
    return this.funds.findMany(query.householdId, { activeOnly: query.activeOnly });
  }
}
