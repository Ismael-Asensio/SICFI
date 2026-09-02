import { BusinessRuleError, NotFoundError, type DomainError } from '../../../../shared/domain/domain-error';
import { err, ok, type Result } from '../../../../shared/domain/result';
import type { CategoryRepository } from '../../domain/category.repository';

export interface DeleteCategoryCommand {
  householdId: string;
  categoryId: string;
}

export class DeleteCategoryUseCase {
  constructor(private readonly categories: CategoryRepository) {}

  async execute(command: DeleteCategoryCommand): Promise<Result<void, DomainError>> {
    const category = await this.categories.findById(command.householdId, command.categoryId);
    if (!category) {
      return err(new NotFoundError('La categoría no existe', { categoryId: command.categoryId }));
    }

    if (!category.canBeDeleted) {
      return err(
        new BusinessRuleError(
          'system-category',
          'Una categoría del catálogo por defecto no se puede eliminar; desactívala en su lugar',
          { categoryId: command.categoryId }
        )
      );
    }

    // Si tiene fijos o movimientos asociados, `onDelete: Restrict` del esquema
    // rechazará el borrado en la base; el mapper de la Fase 5 traduce ese
    // fallo a un DomainError. Aquí no se repite la comprobación con una
    // segunda consulta.
    await this.categories.delete(command.householdId, command.categoryId);
    return ok();
  }
}
