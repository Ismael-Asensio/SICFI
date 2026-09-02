import { Entity } from '../../../shared/domain/entity';

export interface PaymentMethodProps {
  id: string;
  householdId: string;
  name: string;
  isSystem: boolean;
  isActive: boolean;
  sortOrder: number;
}

export class PaymentMethod extends Entity<string> {
  readonly householdId: string;
  readonly name: string;
  readonly isSystem: boolean;
  readonly isActive: boolean;
  readonly sortOrder: number;

  constructor(props: PaymentMethodProps) {
    super(props.id);
    this.householdId = props.householdId;
    this.name = props.name;
    this.isSystem = props.isSystem;
    this.isActive = props.isActive;
    this.sortOrder = props.sortOrder;
  }

  get canBeDeleted(): boolean {
    return !this.isSystem;
  }

  with(changes: Partial<Omit<PaymentMethodProps, 'id' | 'householdId'>>): PaymentMethod {
    return new PaymentMethod({ ...this, ...changes, id: this.id, householdId: this.householdId });
  }
}
