/**
 * `Category` — hoja `Listas`. `kind` es solo un "tipo sugerido": no obliga a
 * que los movimientos de esa categoría sean de ese `MovementType` (el Excel ya
 * permitía anotar un gasto Variable bajo una categoría "de tipo Fijo").
 */
import { Entity } from '../../../shared/domain/entity';

export type CategoryKind = 'FIJO' | 'VARIABLE' | 'AHORRO';

export interface CategoryProps {
  id: string;
  householdId: string;
  name: string;
  kind: CategoryKind;
  color: string | null;
  icon: string | null;
  /** Vino del catálogo por defecto (`BootstrapUserUseCase`), no lo creó el usuario. */
  isSystem: boolean;
  isActive: boolean;
  sortOrder: number;
}

export class Category extends Entity<string> {
  readonly householdId: string;
  readonly name: string;
  readonly kind: CategoryKind;
  readonly color: string | null;
  readonly icon: string | null;
  readonly isSystem: boolean;
  readonly isActive: boolean;
  readonly sortOrder: number;

  constructor(props: CategoryProps) {
    super(props.id);
    this.householdId = props.householdId;
    this.name = props.name;
    this.kind = props.kind;
    this.color = props.color;
    this.icon = props.icon;
    this.isSystem = props.isSystem;
    this.isActive = props.isActive;
    this.sortOrder = props.sortOrder;
  }

  /**
   * Las del catálogo por defecto no se borran: todo lo demás del sistema
   * (fijos, movimientos existentes) puede seguir apuntando a ellas.
   */
  get canBeDeleted(): boolean {
    return !this.isSystem;
  }

  with(changes: Partial<Omit<CategoryProps, 'id' | 'householdId'>>): Category {
    return new Category({ ...this, ...changes, id: this.id, householdId: this.householdId });
  }
}
