import type { Period } from '../../domain/period.entity';
import type { PeriodRepository } from '../../domain/period.repository';

export interface ListPeriodsQuery {
  householdId: string;
  year: number;
}

export class ListPeriodsUseCase {
  constructor(private readonly periods: PeriodRepository) {}

  async execute(query: ListPeriodsQuery): Promise<Period[]> {
    const periods = await this.periods.findByYear(query.householdId, query.year);
    return [...periods].sort((a, b) => a.number - b.number);
  }
}
