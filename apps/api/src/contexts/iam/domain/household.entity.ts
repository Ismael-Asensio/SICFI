/**
 * `Household` — el discriminante de tenant (D2, RN-42).
 *
 * `baseCurrency` es la moneda en la que se expresa todo reporte (RN-36).
 * Cambiarla exige recalcular `baseAmount` de todo el histórico (RN-38b) —
 * una operación explícita y transaccional que se implementa en la Fase 5/8,
 * no un `PATCH` de este campo.
 */
import type { Currency } from '../../../shared/domain/currency.vo';
import { Entity } from '../../../shared/domain/entity';

export interface HouseholdProps {
  id: string;
  name: string;
  baseCurrency: Currency;
  timezone: string;
}

export class Household extends Entity<string> {
  readonly name: string;
  readonly baseCurrency: Currency;
  readonly timezone: string;

  constructor(props: HouseholdProps) {
    super(props.id);
    this.name = props.name;
    this.baseCurrency = props.baseCurrency;
    this.timezone = props.timezone;
  }
}
