import type { CalendarDate } from '../../../../shared/domain/calendar-date.vo';
import type { Currency } from '../../../../shared/domain/currency.vo';
import type { DomainError } from '../../../../shared/domain/domain-error';
import type { IdGenerator } from '../../../../shared/domain/id-generator.port';
import { Money } from '../../../../shared/domain/money.vo';
import { Percentage } from '../../../../shared/domain/percentage.vo';
import { ok, type Result } from '../../../../shared/domain/result';
import type { TenantContext } from '../../../../shared/domain/tenant-context.port';
import type { UnitOfWork } from '../../../../shared/domain/unit-of-work.port';
import { BudgetSettings } from '../../../budget/domain/budget-settings.entity';
import type { BudgetSettingsRepository } from '../../../budget/domain/budget-settings.repository';
import { PeriodFactory } from '../../../budget/domain/period-factory.service';
import { Period } from '../../../budget/domain/period.entity';
import type { PeriodRepository } from '../../../budget/domain/period.repository';
import { Category } from '../../../catalog/domain/category.entity';
import type { CategoryRepository } from '../../../catalog/domain/category.repository';
import { DEFAULT_CATEGORIES, DEFAULT_PAYMENT_METHODS, DEFAULT_SAVINGS_FUND_NAME } from '../../../catalog/domain/default-catalog';
import { PaymentMethod } from '../../../catalog/domain/payment-method.entity';
import type { PaymentMethodRepository } from '../../../catalog/domain/payment-method.repository';
import { SavingsFund } from '../../../catalog/domain/savings-fund.entity';
import type { SavingsFundRepository } from '../../../catalog/domain/savings-fund.repository';
import { Household } from '../../domain/household.entity';
import type { HouseholdRepository } from '../../domain/household.repository';
import { HouseholdMember } from '../../domain/household-member.entity';
import type { HouseholdMemberRepository } from '../../domain/household-member.repository';
import { Profile } from '../../domain/profile.entity';
import type { ProfileRepository } from '../../domain/profile.repository';
import { User } from '../../domain/user.entity';
import type { UserRepository } from '../../domain/user.repository';

export interface BootstrapUserCommand {
  /** El `sub` del JWT de Supabase — no se genera, llega ya asignado. */
  userId: string;
  email: string;
  displayName: string;
  householdName: string;
  baseCurrency: Currency;
  timezone: string;
  year: number;
  /** RN-35. Normalmente "hoy" o el 1 de enero del año que se inicializa. */
  controlStartDate: CalendarDate;
}

export interface BootstrappedUser {
  user: User;
  profile: Profile;
  household: Household;
  membership: HouseholdMember;
  settings: BudgetSettings;
  periods: Period[];
}

/**
 * El alta de un usuario nuevo: perfil, household propio como `OWNER`, la
 * configuración del año y sus 24 quincenas, y el catálogo por defecto —
 * categorías, métodos de pago y un fondo de ahorro. **Nunca** crea gastos
 * fijos: esos los declara el usuario (o los trae el importador de la Fase 12).
 *
 * Idempotente por construcción: cada paso busca antes de crear, igual que
 * `prisma/seed.ts`. Puede repetirse tras un fallo a mitad de camino sin
 * duplicar nada.
 */
export class BootstrapUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly profiles: ProfileRepository,
    private readonly households: HouseholdRepository,
    private readonly members: HouseholdMemberRepository,
    private readonly settingsRepo: BudgetSettingsRepository,
    private readonly periodsRepo: PeriodRepository,
    private readonly categories: CategoryRepository,
    private readonly paymentMethods: PaymentMethodRepository,
    private readonly savingsFunds: SavingsFundRepository,
    private readonly ids: IdGenerator,
    private readonly unitOfWork: UnitOfWork,
    private readonly tenant: TenantContext
  ) {}

  /**
   * Todo el onboarding es una sola transacción: si falla al sembrar el
   * catálogo, no debe quedar a medias un household sin sus quincenas.
   *
   * ⚠️ Este es **el único caso de uso que abre el ámbito de sistema**, y tiene
   * que serlo: crea el household, así que no puede exigir uno ya existente en
   * el contexto — sería un círculo. El tramo de sistema se mantiene tan corto
   * como se puede: en cuanto el household existe, el resto del alta pasa a
   * ámbito estricto y queda filtrado por él como cualquier otra operación.
   */
  execute(command: BootstrapUserCommand): Promise<Result<BootstrappedUser, DomainError>> {
    return this.unitOfWork.run(() =>
      this.tenant.runAsSystem(async () => {
        const user = await this.findOrCreateUser(command);
        const household = await this.findOrCreateHousehold(command);

        return this.tenant.runWith({ householdId: household.id, userId: user.id }, async () => {
          const membership = await this.findOrCreateMembership(household.id, user.id);
          const profile = await this.findOrCreateProfile(command, user.id, household.id);
          const { settings, periods } = await this.findOrCreateBudget(command, household.id);
          await this.seedCatalog(household.id, command.baseCurrency);

          return ok({ user, profile, household, membership, settings, periods });
        });
      })
    );
  }

  private async findOrCreateUser(command: BootstrapUserCommand): Promise<User> {
    const existing = await this.users.findById(command.userId);
    if (existing) return existing;

    const user = new User({ id: command.userId, email: command.email });
    await this.users.save(user);
    return user;
  }

  private async findOrCreateHousehold(command: BootstrapUserCommand): Promise<Household> {
    // El household no tiene clave natural propia; la idempotencia se resuelve
    // por la RELACIÓN ya existente (¿a qué household pertenece ya este
    // usuario?), nunca adivinando su id. Un household nuevo se crea con un id
    // generado — jamás el del usuario: son espacios de identidad distintos, y
    // confundirlos rompía la idempotencia (cada reintento generaba un id
    // nuevo, así que la búsqueda por household.id === userId nunca encajaba).
    const existingMemberships = await this.members.findByUserAcrossHouseholds(command.userId);
    for (const membership of existingMemberships) {
      const existing = await this.households.findById(membership.householdId);
      if (existing) return existing;
    }

    const household = new Household({
      id: this.ids.generate(),
      name: command.householdName,
      baseCurrency: command.baseCurrency,
      timezone: command.timezone,
    });
    await this.households.save(household);
    return household;
  }

  private async findOrCreateMembership(
    householdId: string,
    userId: string
  ): Promise<HouseholdMember> {
    const existing = await this.members.findByUser(householdId, userId);
    if (existing) return existing;

    const membership = new HouseholdMember({
      id: this.ids.generate(),
      householdId,
      userId,
      role: 'OWNER',
    });
    await this.members.save(membership);
    return membership;
  }

  private async findOrCreateProfile(
    command: BootstrapUserCommand,
    userId: string,
    householdId: string
  ): Promise<Profile> {
    const existing = await this.profiles.findByUserId(userId);
    if (existing) return existing.activeHouseholdId ? existing : existing.withActiveHousehold(householdId);

    const profile = new Profile({
      id: this.ids.generate(),
      userId,
      displayName: command.displayName,
      locale: 'es-NI',
      timezone: command.timezone,
      activeHouseholdId: householdId,
    });
    await this.profiles.save(profile);
    return profile;
  }

  private async findOrCreateBudget(
    command: BootstrapUserCommand,
    householdId: string
  ): Promise<{ settings: BudgetSettings; periods: Period[] }> {
    const existingSettings = await this.settingsRepo.findByYear(householdId, command.year);
    if (existingSettings) {
      return { settings: existingSettings, periods: await this.periodsRepo.findByYear(householdId, command.year) };
    }

    const settings = new BudgetSettings({
      id: this.ids.generate(),
      householdId,
      year: command.year,
      name: `Presupuesto ${command.year}`,
      activePeriodOverride: null,
      controlStartDate: command.controlStartDate,
      spendThreshold: Percentage.unsafe('0.80'),
      dueSoonDays: 3,
      inactivityDays: 5,
      savingGoalPerPeriod: Money.zero(command.baseCurrency),
      paidToleranceAmount: Money.unsafe('1', command.baseCurrency),
      disabledAlerts: [],
    });
    await this.settingsRepo.save(settings);

    const periods = PeriodFactory.buildYear(command.year).map(
      (blueprint) =>
        new Period({
          id: this.ids.generate(),
          householdId,
          year: command.year,
          number: blueprint.number,
          month: blueprint.month,
          half: blueprint.half,
          startDate: blueprint.startDate,
          endDate: blueprint.endDate,
          plannedIncome: null,
          plannedIncomeCurrency: command.baseCurrency,
        })
    );
    await this.periodsRepo.saveMany(periods);

    return { settings, periods };
  }

  /**
   * Siembra el catálogo con DOS viajes a la base por tabla —uno para leer lo
   * que ya hay, otro para insertar lo que falta— en vez de dos por fila.
   *
   * La versión ingenua (`findByName` + `save` por cada una de las 31 entradas)
   * costaba ~62 idas y vueltas contra el pooler remoto, y era la causa
   * principal de que toda el alta superara el timeout de la transacción.
   * La idempotencia se conserva: lo que ya existe simplemente no se vuelve a
   * insertar.
   */
  private async seedCatalog(householdId: string, baseCurrency: Currency): Promise<void> {
    const existingCategories = await this.categories.findMany(householdId);
    const existingCategoryNames = new Set(existingCategories.map((category) => category.name));

    const missingCategories = DEFAULT_CATEGORIES.map((category, index) => ({ category, index }))
      .filter(({ category }) => !existingCategoryNames.has(category.name))
      .map(
        ({ category, index }) =>
          new Category({
            id: this.ids.generate(),
            householdId,
            name: category.name,
            kind: category.kind,
            color: null,
            icon: null,
            isSystem: true,
            isActive: true,
            sortOrder: index,
          })
      );
    await this.categories.createMany(missingCategories);

    const existingMethods = await this.paymentMethods.findMany(householdId);
    const existingMethodNames = new Set(existingMethods.map((method) => method.name));

    const missingMethods = DEFAULT_PAYMENT_METHODS.map((name, index) => ({ name, index }))
      .filter(({ name }) => !existingMethodNames.has(name))
      .map(
        ({ name, index }) =>
          new PaymentMethod({
            id: this.ids.generate(),
            householdId,
            name,
            isSystem: true,
            isActive: true,
            sortOrder: index,
          })
      );
    await this.paymentMethods.createMany(missingMethods);

    const existingFund = await this.savingsFunds.findByName(householdId, DEFAULT_SAVINGS_FUND_NAME);
    if (!existingFund) {
      await this.savingsFunds.save(
        new SavingsFund({
          id: this.ids.generate(),
          householdId,
          name: DEFAULT_SAVINGS_FUND_NAME,
          currency: baseCurrency,
          targetAmount: null,
          targetDate: null,
          isDefault: true,
          isActive: true,
        })
      );
    }
  }
}
