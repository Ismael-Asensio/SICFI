import type { Category } from '../../src/contexts/catalog/domain/category.entity';
import type { CategoryRepository } from '../../src/contexts/catalog/domain/category.repository';
import type { PaymentMethod } from '../../src/contexts/catalog/domain/payment-method.entity';
import type { PaymentMethodRepository } from '../../src/contexts/catalog/domain/payment-method.repository';
import type { SavingsFund } from '../../src/contexts/catalog/domain/savings-fund.entity';
import type { SavingsFundRepository } from '../../src/contexts/catalog/domain/savings-fund.repository';

export class InMemoryCategoryRepository implements CategoryRepository {
  private rows = new Map<string, Category>();

  findById(householdId: string, id: string): Promise<Category | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row && row.householdId === householdId ? row : null);
  }

  findByName(householdId: string, name: string): Promise<Category | null> {
    for (const row of this.rows.values()) {
      if (row.householdId === householdId && row.name === name) return Promise.resolve(row);
    }
    return Promise.resolve(null);
  }

  findMany(householdId: string, options?: { activeOnly?: boolean }): Promise<Category[]> {
    const all = [...this.rows.values()].filter((row) => row.householdId === householdId);
    return Promise.resolve(options?.activeOnly ? all.filter((row) => row.isActive) : all);
  }

  save(category: Category): Promise<void> {
    this.rows.set(category.id, category);
    return Promise.resolve();
  }

  delete(householdId: string, id: string): Promise<void> {
    const row = this.rows.get(id);
    if (row && row.householdId === householdId) this.rows.delete(id);
    return Promise.resolve();
  }
}

export class InMemoryPaymentMethodRepository implements PaymentMethodRepository {
  private rows = new Map<string, PaymentMethod>();

  findById(householdId: string, id: string): Promise<PaymentMethod | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row && row.householdId === householdId ? row : null);
  }

  findByName(householdId: string, name: string): Promise<PaymentMethod | null> {
    for (const row of this.rows.values()) {
      if (row.householdId === householdId && row.name === name) return Promise.resolve(row);
    }
    return Promise.resolve(null);
  }

  findMany(householdId: string, options?: { activeOnly?: boolean }): Promise<PaymentMethod[]> {
    const all = [...this.rows.values()].filter((row) => row.householdId === householdId);
    return Promise.resolve(options?.activeOnly ? all.filter((row) => row.isActive) : all);
  }

  save(paymentMethod: PaymentMethod): Promise<void> {
    this.rows.set(paymentMethod.id, paymentMethod);
    return Promise.resolve();
  }

  delete(householdId: string, id: string): Promise<void> {
    const row = this.rows.get(id);
    if (row && row.householdId === householdId) this.rows.delete(id);
    return Promise.resolve();
  }
}

export class InMemorySavingsFundRepository implements SavingsFundRepository {
  private rows = new Map<string, SavingsFund>();

  findById(householdId: string, id: string): Promise<SavingsFund | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row && row.householdId === householdId ? row : null);
  }

  findByName(householdId: string, name: string): Promise<SavingsFund | null> {
    for (const row of this.rows.values()) {
      if (row.householdId === householdId && row.name === name) return Promise.resolve(row);
    }
    return Promise.resolve(null);
  }

  findMany(householdId: string, options?: { activeOnly?: boolean }): Promise<SavingsFund[]> {
    const all = [...this.rows.values()].filter((row) => row.householdId === householdId);
    return Promise.resolve(options?.activeOnly ? all.filter((row) => row.isActive) : all);
  }

  save(fund: SavingsFund): Promise<void> {
    this.rows.set(fund.id, fund);
    return Promise.resolve();
  }
}
