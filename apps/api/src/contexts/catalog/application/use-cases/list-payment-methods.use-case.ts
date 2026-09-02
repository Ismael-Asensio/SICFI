import type { PaymentMethod } from '../../domain/payment-method.entity';
import type { PaymentMethodRepository } from '../../domain/payment-method.repository';

export interface ListPaymentMethodsQuery {
  householdId: string;
  activeOnly?: boolean;
}

export class ListPaymentMethodsUseCase {
  constructor(private readonly paymentMethods: PaymentMethodRepository) {}

  async execute(query: ListPaymentMethodsQuery): Promise<PaymentMethod[]> {
    const paymentMethods = await this.paymentMethods.findMany(query.householdId, {
      activeOnly: query.activeOnly,
    });
    return [...paymentMethods].sort((a, b) => a.sortOrder - b.sortOrder);
  }
}
