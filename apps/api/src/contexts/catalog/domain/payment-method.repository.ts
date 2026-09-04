import type { PaymentMethod } from './payment-method.entity';

export const PAYMENT_METHOD_REPOSITORY = Symbol('PAYMENT_METHOD_REPOSITORY');

export interface PaymentMethodRepository {
  findById(householdId: string, id: string): Promise<PaymentMethod | null>;
  findByName(householdId: string, name: string): Promise<PaymentMethod | null>;
  findMany(householdId: string, options?: { activeOnly?: boolean }): Promise<PaymentMethod[]>;
  save(paymentMethod: PaymentMethod): Promise<void>;
  /** Alta en lote de filas nuevas; ignora las que ya existan por id. */
  createMany(paymentMethods: readonly PaymentMethod[]): Promise<void>;
  delete(householdId: string, id: string): Promise<void>;
}
