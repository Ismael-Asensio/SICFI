/**
 * Cablea puertos ↔ adaptadores del contexto `iam` (CLAUDE.md §8).
 *
 * Los casos de uso son clases planas sin decoradores de Nest: se construyen
 * con `useFactory` a partir de los tokens. Así el `application/` sigue sin
 * saber que Nest existe, que es justo la regla de dependencia.
 */
import { Module } from '@nestjs/common';

import { BudgetModule } from '../budget/budget.module';
import { CatalogModule } from '../catalog/catalog.module';

import { CLOCK, type Clock } from '../../shared/domain/clock.port';
import { ID_GENERATOR, type IdGenerator } from '../../shared/domain/id-generator.port';
import { TENANT_CONTEXT, type TenantContext } from '../../shared/domain/tenant-context.port';
import { UNIT_OF_WORK, type UnitOfWork } from '../../shared/domain/unit-of-work.port';
import {
  BUDGET_SETTINGS_REPOSITORY,
  type BudgetSettingsRepository,
} from '../budget/domain/budget-settings.repository';
import { PERIOD_REPOSITORY, type PeriodRepository } from '../budget/domain/period.repository';
import {
  CATEGORY_REPOSITORY,
  type CategoryRepository,
} from '../catalog/domain/category.repository';
import {
  PAYMENT_METHOD_REPOSITORY,
  type PaymentMethodRepository,
} from '../catalog/domain/payment-method.repository';
import {
  SAVINGS_FUND_REPOSITORY,
  type SavingsFundRepository,
} from '../catalog/domain/savings-fund.repository';

import { AcceptInviteUseCase } from './application/use-cases/accept-invite.use-case';
import { BootstrapUserUseCase } from './application/use-cases/bootstrap-user.use-case';
import { ChangeMemberRoleUseCase } from './application/use-cases/change-member-role.use-case';
import { InviteMemberUseCase } from './application/use-cases/invite-member.use-case';
import { LeaveHouseholdUseCase } from './application/use-cases/leave-household.use-case';
import { ListMembersUseCase } from './application/use-cases/list-members.use-case';
import { ListMyHouseholdsUseCase } from './application/use-cases/list-my-households.use-case';
import { RemoveMemberUseCase } from './application/use-cases/remove-member.use-case';
import { SwitchActiveHouseholdUseCase } from './application/use-cases/switch-active-household.use-case';
import { TransferOwnershipUseCase } from './application/use-cases/transfer-ownership.use-case';
import {
  HOUSEHOLD_INVITE_REPOSITORY,
  type HouseholdInviteRepository,
} from './domain/household-invite.repository';
import {
  HOUSEHOLD_MEMBER_REPOSITORY,
  type HouseholdMemberRepository,
} from './domain/household-member.repository';
import { HOUSEHOLD_REPOSITORY, type HouseholdRepository } from './domain/household.repository';
import { PROFILE_REPOSITORY, type ProfileRepository } from './domain/profile.repository';
import { USER_REPOSITORY, type UserRepository } from './domain/user.repository';
import { AuthController } from './infrastructure/http/auth.controller';
import { HouseholdsController } from './infrastructure/http/households.controller';
import { PrismaHouseholdInviteRepository } from './infrastructure/persistence/prisma-household-invite.repository';
import { PrismaHouseholdMemberRepository } from './infrastructure/persistence/prisma-household-member.repository';
import { PrismaHouseholdRepository } from './infrastructure/persistence/prisma-household.repository';
import { PrismaProfileRepository } from './infrastructure/persistence/prisma-profile.repository';
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository';

@Module({
  // El alta de usuario siembra catálogo y quincenas: necesita los puertos de
  // esos contextos.
  imports: [CatalogModule, BudgetModule],
  controllers: [AuthController, HouseholdsController],
  providers: [
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: PROFILE_REPOSITORY, useClass: PrismaProfileRepository },
    { provide: HOUSEHOLD_REPOSITORY, useClass: PrismaHouseholdRepository },
    { provide: HOUSEHOLD_MEMBER_REPOSITORY, useClass: PrismaHouseholdMemberRepository },
    { provide: HOUSEHOLD_INVITE_REPOSITORY, useClass: PrismaHouseholdInviteRepository },

    {
      provide: BootstrapUserUseCase,
      inject: [
        USER_REPOSITORY,
        PROFILE_REPOSITORY,
        HOUSEHOLD_REPOSITORY,
        HOUSEHOLD_MEMBER_REPOSITORY,
        BUDGET_SETTINGS_REPOSITORY,
        PERIOD_REPOSITORY,
        CATEGORY_REPOSITORY,
        PAYMENT_METHOD_REPOSITORY,
        SAVINGS_FUND_REPOSITORY,
        ID_GENERATOR,
        UNIT_OF_WORK,
        TENANT_CONTEXT,
      ],
      useFactory: (
        users: UserRepository,
        profiles: ProfileRepository,
        households: HouseholdRepository,
        members: HouseholdMemberRepository,
        settings: BudgetSettingsRepository,
        periods: PeriodRepository,
        categories: CategoryRepository,
        paymentMethods: PaymentMethodRepository,
        savingsFunds: SavingsFundRepository,
        ids: IdGenerator,
        unitOfWork: UnitOfWork,
        tenant: TenantContext
      ) =>
        new BootstrapUserUseCase(
          users,
          profiles,
          households,
          members,
          settings,
          periods,
          categories,
          paymentMethods,
          savingsFunds,
          ids,
          unitOfWork,
          tenant
        ),
    },
    {
      provide: ListMyHouseholdsUseCase,
      inject: [
        HOUSEHOLD_MEMBER_REPOSITORY,
        HOUSEHOLD_REPOSITORY,
        PROFILE_REPOSITORY,
        TENANT_CONTEXT,
      ],
      useFactory: (
        members: HouseholdMemberRepository,
        households: HouseholdRepository,
        profiles: ProfileRepository,
        tenant: TenantContext
      ) => new ListMyHouseholdsUseCase(members, households, profiles, tenant),
    },
    {
      provide: SwitchActiveHouseholdUseCase,
      inject: [PROFILE_REPOSITORY, HOUSEHOLD_MEMBER_REPOSITORY, TENANT_CONTEXT],
      useFactory: (
        profiles: ProfileRepository,
        members: HouseholdMemberRepository,
        tenant: TenantContext
      ) => new SwitchActiveHouseholdUseCase(profiles, members, tenant),
    },
    {
      provide: ListMembersUseCase,
      inject: [HOUSEHOLD_MEMBER_REPOSITORY],
      useFactory: (members: HouseholdMemberRepository) => new ListMembersUseCase(members),
    },
    {
      provide: ChangeMemberRoleUseCase,
      inject: [HOUSEHOLD_MEMBER_REPOSITORY],
      useFactory: (members: HouseholdMemberRepository) => new ChangeMemberRoleUseCase(members),
    },
    {
      provide: RemoveMemberUseCase,
      inject: [HOUSEHOLD_MEMBER_REPOSITORY],
      useFactory: (members: HouseholdMemberRepository) => new RemoveMemberUseCase(members),
    },
    {
      provide: LeaveHouseholdUseCase,
      inject: [HOUSEHOLD_MEMBER_REPOSITORY],
      useFactory: (members: HouseholdMemberRepository) => new LeaveHouseholdUseCase(members),
    },
    {
      provide: TransferOwnershipUseCase,
      inject: [HOUSEHOLD_MEMBER_REPOSITORY, UNIT_OF_WORK],
      useFactory: (members: HouseholdMemberRepository, unitOfWork: UnitOfWork) =>
        new TransferOwnershipUseCase(members, unitOfWork),
    },
    {
      provide: InviteMemberUseCase,
      inject: [HOUSEHOLD_INVITE_REPOSITORY, ID_GENERATOR, CLOCK],
      useFactory: (invites: HouseholdInviteRepository, ids: IdGenerator, clock: Clock) =>
        new InviteMemberUseCase(invites, ids, clock),
    },
    {
      provide: AcceptInviteUseCase,
      inject: [
        HOUSEHOLD_INVITE_REPOSITORY,
        HOUSEHOLD_MEMBER_REPOSITORY,
        USER_REPOSITORY,
        ID_GENERATOR,
        CLOCK,
        TENANT_CONTEXT,
        UNIT_OF_WORK,
      ],
      useFactory: (
        invites: HouseholdInviteRepository,
        members: HouseholdMemberRepository,
        users: UserRepository,
        ids: IdGenerator,
        clock: Clock,
        tenant: TenantContext,
        unitOfWork: UnitOfWork
      ) => new AcceptInviteUseCase(invites, members, users, ids, clock, tenant, unitOfWork),
    },
  ],
  exports: [USER_REPOSITORY, PROFILE_REPOSITORY, HOUSEHOLD_REPOSITORY, HOUSEHOLD_MEMBER_REPOSITORY],
})
export class IamModule {}
