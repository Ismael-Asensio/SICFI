import { NotFoundError, type DomainError } from '../../../../shared/domain/domain-error';
import { err, ok, type Result } from '../../../../shared/domain/result';
import type { Category } from '../../domain/category.entity';
import type { CategoryRepository } from '../../domain/category.repository';

export interface SetCategoryActiveCommand {
  householdId: string;
  categoryId: string;
  isActive: boolean;
}

/**
 * Activa o desactiva una categoría. A diferencia de un fijo (RN-20), aquí no
 * hay una regla de negocio numerada que lo exija — es la vía para "retirar"
 * una categoría del catálogo sin romper el histórico de movimientos que ya la
 * usan, incluidas las del sistema.
 */
export class SetCategoryActiveUseCase {
  constructor(private readonly categories: CategoryRepository) {}

  async execute(command: SetCategoryActiveCommand): Promise<Result<Category, DomainError>> {
    const category = await this.categories.findById(command.householdId, command.categoryId);
    if (!category) {
      return err(new NotFoundError('La categoría no existe', { categoryId: command.categoryId }));
    }

    const updated = category.with({ isActive: command.isActive });
    await this.categories.save(updated);
    return ok(updated);
  }
}
