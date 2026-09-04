import type { Category } from './category.entity';

export const CATEGORY_REPOSITORY = Symbol('CATEGORY_REPOSITORY');

export interface CategoryRepository {
  findById(householdId: string, id: string): Promise<Category | null>;
  /** Para la unicidad `@@unique([householdId, name])` del esquema. */
  findByName(householdId: string, name: string): Promise<Category | null>;
  findMany(householdId: string, options?: { activeOnly?: boolean }): Promise<Category[]>;
  save(category: Category): Promise<void>;
  /** Alta en lote de filas nuevas; ignora las que ya existan por id. */
  createMany(categories: readonly Category[]): Promise<void>;
  delete(householdId: string, id: string): Promise<void>;
}
