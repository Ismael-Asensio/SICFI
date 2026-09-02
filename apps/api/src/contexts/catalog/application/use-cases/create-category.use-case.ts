import { ConflictError, ValidationError, type DomainError } from '../../../../shared/domain/domain-error';
import type { IdGenerator } from '../../../../shared/domain/id-generator.port';
import { err, ok, type Result } from '../../../../shared/domain/result';
import { Category, type CategoryKind } from '../../domain/category.entity';
import type { CategoryRepository } from '../../domain/category.repository';

export interface CreateCategoryCommand {
  householdId: string;
  name: string;
  kind: CategoryKind;
  color?: string | null;
  icon?: string | null;
  sortOrder?: number;
}

export class CreateCategoryUseCase {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly ids: IdGenerator
  ) {}

  async execute(command: CreateCategoryCommand): Promise<Result<Category, DomainError>> {
    const name = command.name.trim();
    if (!name) {
      return err(new ValidationError('El nombre de la categoría no puede estar vacío'));
    }

    const existing = await this.categories.findByName(command.householdId, name);
    if (existing) {
      return err(new ConflictError(`Ya existe una categoría llamada "${name}"`, { name }));
    }

    const category = new Category({
      id: this.ids.generate(),
      householdId: command.householdId,
      name,
      kind: command.kind,
      color: command.color ?? null,
      icon: command.icon ?? null,
      // Las creadas por el usuario nunca son de sistema: solo el catálogo por
      // defecto del onboarding lo es (BootstrapUserUseCase).
      isSystem: false,
      isActive: true,
      sortOrder: command.sortOrder ?? 0,
    });

    await this.categories.save(category);
    return ok(category);
  }
}
