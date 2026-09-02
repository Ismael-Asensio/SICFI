import type { Category } from '../../domain/category.entity';
import type { CategoryRepository } from '../../domain/category.repository';

export interface ListCategoriesQuery {
  householdId: string;
  activeOnly?: boolean;
}

export class ListCategoriesUseCase {
  constructor(private readonly categories: CategoryRepository) {}

  async execute(query: ListCategoriesQuery): Promise<Category[]> {
    const categories = await this.categories.findMany(query.householdId, {
      activeOnly: query.activeOnly,
    });
    return [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
  }
}
