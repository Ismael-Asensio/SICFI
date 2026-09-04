import type { PaymentMethod as PrismaPaymentMethod } from '@prisma/client';

import { PaymentMethod } from '../../domain/payment-method.entity';

export const PaymentMethodPrismaMapper = {
  toDomain(row: PrismaPaymentMethod): PaymentMethod {
    return new PaymentMethod({
      id: row.id,
      householdId: row.householdId,
      name: row.name,
      isSystem: row.isSystem,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
    });
  },

  toPersistence(paymentMethod: PaymentMethod): {
    id: string;
    householdId: string;
    name: string;
    isSystem: boolean;
    isActive: boolean;
    sortOrder: number;
  } {
    return {
      id: paymentMethod.id,
      householdId: paymentMethod.householdId,
      name: paymentMethod.name,
      isSystem: paymentMethod.isSystem,
      isActive: paymentMethod.isActive,
      sortOrder: paymentMethod.sortOrder,
    };
  },
};
