/**
 * `Transaction` — hoja `Registro`. El núcleo transaccional del sistema.
 *
 * Es una `AggregateRoot`: registrar un movimiento es un hecho de negocio que
 * vale la pena anunciar (para una futura auditoría o notificación), así que
 * `register()` deja un evento `transaction.registered` listo para publicarse
 * después de persistir con éxito.
 */
import type Decimal from 'decimal.js';

import type { CalendarDate } from '../../../shared/domain/calendar-date.vo';
import { domainEvent } from '../../../shared/domain/domain-event';
import { AggregateRoot } from '../../../shared/domain/entity';
import type { Money } from '../../../shared/domain/money.vo';

import { MovementTypes, type MovementType, type TxStatus } from './movement-type';

export interface TransactionProps {
  id: string;
  householdId: string;
  date: CalendarDate;
  /** DERIVADO de `date` (RN-03, RN-29). Se recalcula si cambia la fecha. */
  periodId: string;
  type: MovementType;
  categoryId: string;
  concept: string;
  recurringExpenseId: string | null;
  savingsFundId: string | null;
  /** En la moneda original, tal y como lo capturó el usuario. */
  amount: Money;
  exchangeRate: Decimal;
  /** `amount × exchangeRate`, en la moneda base. Lo que agregan los reportes (RN-36). */
  baseAmount: Money;
  paymentMethodId: string | null;
  status: TxStatus;
  notes: string | null;
  /** RN-45: inmutable una vez creado. */
  createdByUserId: string;
}

export class Transaction extends AggregateRoot<string> {
  readonly householdId: string;
  readonly date: CalendarDate;
  readonly periodId: string;
  readonly type: MovementType;
  readonly categoryId: string;
  readonly concept: string;
  readonly recurringExpenseId: string | null;
  readonly savingsFundId: string | null;
  readonly amount: Money;
  readonly exchangeRate: Decimal;
  readonly baseAmount: Money;
  readonly paymentMethodId: string | null;
  readonly status: TxStatus;
  readonly notes: string | null;
  readonly createdByUserId: string;

  private constructor(props: TransactionProps) {
    super(props.id);
    this.householdId = props.householdId;
    this.date = props.date;
    this.periodId = props.periodId;
    this.type = props.type;
    this.categoryId = props.categoryId;
    this.concept = props.concept;
    this.recurringExpenseId = props.recurringExpenseId;
    this.savingsFundId = props.savingsFundId;
    this.amount = props.amount;
    this.exchangeRate = props.exchangeRate;
    this.baseAmount = props.baseAmount;
    this.paymentMethodId = props.paymentMethodId;
    this.status = props.status;
    this.notes = props.notes;
    this.createdByUserId = props.createdByUserId;
  }

  /** Reconstrucción desde persistencia: sin evento, ya ocurrió en el pasado. */
  static reconstitute(props: TransactionProps): Transaction {
    return new Transaction(props);
  }

  /** Alta de un movimiento nuevo: registra el evento de dominio. */
  static register(props: TransactionProps, occurredAt: Date): Transaction {
    const transaction = new Transaction(props);
    transaction.record(
      domainEvent('transaction.registered', transaction.id, transaction.householdId, occurredAt, {
        type: transaction.type,
        periodId: transaction.periodId,
        baseAmount: transaction.baseAmount.toFixed(),
      })
    );
    return transaction;
  }

  /** Aplica cambios y registra `transaction.updated`. RN-45: no puede tocar `createdByUserId`. */
  update(
    changes: Partial<Omit<TransactionProps, 'id' | 'householdId' | 'createdByUserId'>>,
    occurredAt: Date
  ): Transaction {
    const updated = new Transaction({
      ...this,
      ...changes,
      id: this.id,
      householdId: this.householdId,
      createdByUserId: this.createdByUserId,
    });
    updated.record(
      domainEvent('transaction.updated', this.id, this.householdId, occurredAt, {
        type: updated.type,
        periodId: updated.periodId,
      })
    );
    return updated;
  }

  /** RN-27: PAGADO y PENDIENTE cuentan en el gasto; PROGRAMADO es una previsión futura. */
  get countsTowardSpending(): boolean {
    return this.status !== 'PROGRAMADO';
  }

  get isRealSpend(): boolean {
    return MovementTypes.isRealSpend(this.type);
  }

  get isInflow(): boolean {
    return MovementTypes.isInflow(this.type);
  }
}
