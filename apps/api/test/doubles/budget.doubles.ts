import type { CalendarDate } from '../../src/shared/domain/calendar-date.vo';
import type { BudgetSettings } from '../../src/contexts/budget/domain/budget-settings.entity';
import type { BudgetSettingsRepository } from '../../src/contexts/budget/domain/budget-settings.repository';
import type { Period } from '../../src/contexts/budget/domain/period.entity';
import type { PeriodRepository } from '../../src/contexts/budget/domain/period.repository';

export class InMemoryBudgetSettingsRepository implements BudgetSettingsRepository {
  private rows = new Map<string, BudgetSettings>();

  private key(householdId: string, year: number): string {
    return `${householdId}:${year}`;
  }

  findByYear(householdId: string, year: number): Promise<BudgetSettings | null> {
    return Promise.resolve(this.rows.get(this.key(householdId, year)) ?? null);
  }

  save(settings: BudgetSettings): Promise<void> {
    this.rows.set(this.key(settings.householdId, settings.year), settings);
    return Promise.resolve();
  }
}

export class InMemoryPeriodRepository implements PeriodRepository {
  private rows = new Map<string, Period>();

  findById(householdId: string, id: string): Promise<Period | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row && row.householdId === householdId ? row : null);
  }

  findByNumber(householdId: string, year: number, number: number): Promise<Period | null> {
    for (const row of this.rows.values()) {
      if (row.householdId === householdId && row.year === year && row.number === number) {
        return Promise.resolve(row);
      }
    }
    return Promise.resolve(null);
  }

  findByDate(householdId: string, date: CalendarDate): Promise<Period | null> {
    for (const row of this.rows.values()) {
      if (row.householdId === householdId && row.contains(date)) return Promise.resolve(row);
    }
    return Promise.resolve(null);
  }

  findByYear(householdId: string, year: number): Promise<Period[]> {
    const rows = [...this.rows.values()].filter(
      (row) => row.householdId === householdId && row.year === year
    );
    return Promise.resolve(rows);
  }

  save(period: Period): Promise<void> {
    this.rows.set(period.id, period);
    return Promise.resolve();
  }

  async saveMany(periods: readonly Period[]): Promise<void> {
    for (const period of periods) await this.save(period);
  }
}
