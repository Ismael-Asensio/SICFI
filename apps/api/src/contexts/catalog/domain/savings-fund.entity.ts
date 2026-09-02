/**
 * `SavingsFund` — fondo de ahorro. RN-39 a RN-41b.
 *
 * Existe por D3: el ahorro no es un gasto, es un traslado a un fondo que sigue
 * siendo del usuario. Sin esta entidad, "ahorro" y "lo que sobra" se confunden
 * — que es exactamente el problema P10 del Excel.
 */
import type { CalendarDate } from '../../../shared/domain/calendar-date.vo';
import type { Currency } from '../../../shared/domain/currency.vo';
import { Entity } from '../../../shared/domain/entity';
import { Money } from '../../../shared/domain/money.vo';
import { Percentage } from '../../../shared/domain/percentage.vo';

export interface SavingsFundProps {
  id: string;
  householdId: string;
  name: string;
  currency: Currency;
  targetAmount: Money | null;
  targetDate: CalendarDate | null;
  isDefault: boolean;
  isActive: boolean;
}

export class SavingsFund extends Entity<string> {
  readonly householdId: string;
  readonly name: string;
  readonly currency: Currency;
  readonly targetAmount: Money | null;
  readonly targetDate: CalendarDate | null;
  readonly isDefault: boolean;
  readonly isActive: boolean;

  constructor(props: SavingsFundProps) {
    super(props.id);
    this.householdId = props.householdId;
    this.name = props.name;
    this.currency = props.currency;
    this.targetAmount = props.targetAmount;
    this.targetDate = props.targetDate;
    this.isDefault = props.isDefault;
    this.isActive = props.isActive;
  }

  /** Progreso hacia la meta, si la hay. Puede pasar del 100 %. */
  progressToward(balance: Money): Percentage | null {
    if (!this.targetAmount || !this.targetAmount.isPositive()) return null;
    return Percentage.unsafe(balance.ratioTo(this.targetAmount));
  }

  /** Cuánto falta para la meta. `null` si no hay meta; nunca negativo. */
  remainingToTarget(balance: Money): Money | null {
    if (!this.targetAmount) return null;
    return this.targetAmount.minus(balance).clampToZero();
  }

  with(changes: Partial<Omit<SavingsFundProps, 'id' | 'householdId'>>): SavingsFund {
    return new SavingsFund({ ...this, ...changes, id: this.id, householdId: this.householdId });
  }
}
