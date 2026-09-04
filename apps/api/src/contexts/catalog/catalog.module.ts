import { Module } from '@nestjs/common';

import { CATEGORY_REPOSITORY } from './domain/category.repository';
import { PAYMENT_METHOD_REPOSITORY } from './domain/payment-method.repository';
import { SAVINGS_FUND_REPOSITORY } from './domain/savings-fund.repository';
import { PrismaCategoryRepository } from './infrastructure/persistence/prisma-category.repository';
import { PrismaPaymentMethodRepository } from './infrastructure/persistence/prisma-payment-method.repository';
import { PrismaSavingsFundRepository } from './infrastructure/persistence/prisma-savings-fund.repository';

/**
 * De momento solo publica los puertos de persistencia: los casos de uso de
 * `catalog` se cablean con sus controladores en la Fase 7. `iam` ya los
 * necesita para el alta de usuario.
 */
@Module({
  providers: [
    { provide: CATEGORY_REPOSITORY, useClass: PrismaCategoryRepository },
    { provide: PAYMENT_METHOD_REPOSITORY, useClass: PrismaPaymentMethodRepository },
    { provide: SAVINGS_FUND_REPOSITORY, useClass: PrismaSavingsFundRepository },
  ],
  exports: [CATEGORY_REPOSITORY, PAYMENT_METHOD_REPOSITORY, SAVINGS_FUND_REPOSITORY],
})
export class CatalogModule {}
