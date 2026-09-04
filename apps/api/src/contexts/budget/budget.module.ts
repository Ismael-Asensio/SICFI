import { Module } from '@nestjs/common';

import { BUDGET_SETTINGS_REPOSITORY } from './domain/budget-settings.repository';
import { PERIOD_REPOSITORY } from './domain/period.repository';
import { PrismaBudgetSettingsRepository } from './infrastructure/persistence/prisma-budget-settings.repository';
import { PrismaPeriodRepository } from './infrastructure/persistence/prisma-period.repository';

/** Igual que `CatalogModule`: puertos de persistencia ahora, casos de uso en la Fase 7. */
@Module({
  providers: [
    { provide: BUDGET_SETTINGS_REPOSITORY, useClass: PrismaBudgetSettingsRepository },
    { provide: PERIOD_REPOSITORY, useClass: PrismaPeriodRepository },
  ],
  exports: [BUDGET_SETTINGS_REPOSITORY, PERIOD_REPOSITORY],
})
export class BudgetModule {}
