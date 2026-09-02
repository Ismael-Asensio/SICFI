import {
  ConflictError,
  NotFoundError,
  ValidationError,
  type DomainError,
} from '../../../../shared/domain/domain-error';
import { err, ok, type Result } from '../../../../shared/domain/result';
import type { Category, CategoryKind } from '../../domain/category.entity';
import type { CategoryRepository } from '../../domain/category.repository';

export interface UpdateCategoryCommand {
  householdId: string;
  categoryId: string;
  name?: string;
  kind?: CategoryKind;
  color?: string | null;
  icon?: string | null;
  sortOrder?: number;
}

export class UpdateCategoryUseCase {
  constructor(private readonly categories: CategoryRepository) {}

  async execute(command: UpdateCategoryCommand): Promise<Result<Category, DomainError>> {
    const category = await this.categories.findById(command.householdId, command.categoryId);
    if (!category) {
      return err(new NotFoundError('La categoría no existe', { categoryId: command.categoryId }));
    }

    let name = category.name;
    if (command.name !== undefined) {
      name = command.name.trim();
      if (!name) {
        return err(new ValidationError('El nombre de la categoría no puede estar vacío'));
      }
      if (name !== category.name) {
        const clash = await this.categories.findByName(command.householdId, name);
        if (clash) {
          return err(new ConflictError(`Ya existe una categoría llamada "${name}"`, { name }));
        }
      }
    }

    const updated = category.with({
      name,
      kind: command.kind ?? category.kind,
      color: command.color === undefined ? category.color : command.color,
      icon: command.icon === undefined ? category.icon : command.icon,
      sortOrder: command.sortOrder ?? category.sortOrder,
    });

    await this.categories.save(updated);
    return ok(updated);
  }
}
