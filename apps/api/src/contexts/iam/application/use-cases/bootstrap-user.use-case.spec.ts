import { beforeEach, describe, expect, it } from 'vitest';

import { CalendarDate } from '../../../../shared/domain/calendar-date.vo';
import { Currency } from '../../../../shared/domain/currency.vo';
import { InMemoryBudgetSettingsRepository, InMemoryPeriodRepository } from '../../../../../test/doubles/budget.doubles';
import { InMemoryCategoryRepository, InMemoryPaymentMethodRepository, InMemorySavingsFundRepository } from '../../../../../test/doubles/catalog.doubles';
import { InMemoryHouseholdMemberRepository, InMemoryHouseholdRepository, InMemoryProfileRepository, InMemoryUserRepository } from '../../../../../test/doubles/iam.doubles';
import { SequentialIdGenerator } from '../../../../../test/doubles/id-generator.double';
import { DEFAULT_CATEGORIES, DEFAULT_PAYMENT_METHODS } from '../../../catalog/domain/default-catalog';

import { BootstrapUserUseCase, type BootstrapUserCommand } from './bootstrap-user.use-case';

const NIO = Currency.NIO;
const date = (iso: string): CalendarDate => {
  const result = CalendarDate.fromISO(iso);
  if (!result.ok) throw result.error;
  return result.value;
};

describe('BootstrapUserUseCase', () => {
  let users: InMemoryUserRepository;
  let profiles: InMemoryProfileRepository;
  let households: InMemoryHouseholdRepository;
  let members: InMemoryHouseholdMemberRepository;
  let settingsRepo: InMemoryBudgetSettingsRepository;
  let periodsRepo: InMemoryPeriodRepository;
  let categories: InMemoryCategoryRepository;
  let paymentMethods: InMemoryPaymentMethodRepository;
  let savingsFunds: InMemorySavingsFundRepository;
  let useCase: BootstrapUserUseCase;

  const command: BootstrapUserCommand = {
    userId: 'user-1',
    email: 'nueva@sicfi.local',
    displayName: 'Usuaria Nueva',
    householdName: 'Mi hogar',
    baseCurrency: NIO,
    timezone: 'America/Managua',
    year: 2026,
    controlStartDate: date('2026-03-10'),
  };

  beforeEach(() => {
    users = new InMemoryUserRepository();
    profiles = new InMemoryProfileRepository();
    households = new InMemoryHouseholdRepository();
    members = new InMemoryHouseholdMemberRepository();
    settingsRepo = new InMemoryBudgetSettingsRepository();
    periodsRepo = new InMemoryPeriodRepository();
    categories = new InMemoryCategoryRepository();
    paymentMethods = new InMemoryPaymentMethodRepository();
    savingsFunds = new InMemorySavingsFundRepository();

    useCase = new BootstrapUserUseCase(
      users,
      profiles,
      households,
      members,
      settingsRepo,
      periodsRepo,
      categories,
      paymentMethods,
      savingsFunds,
      new SequentialIdGenerator()
    );
  });

  it('crea todo el onboarding de una vez', async () => {
    const result = await useCase.execute(command);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.user.id).toBe('user-1');
    expect(result.value.membership.role).toBe('OWNER');
    expect(result.value.profile.activeHouseholdId).toBe(result.value.household.id);
    expect(result.value.periods).toHaveLength(24);
  });

  it('siembra el catálogo por defecto: 24 categorías, 7 métodos, 1 fondo (D3)', async () => {
    const result = await useCase.execute(command);
    if (!result.ok) throw result.error;

    const seededCategories = await categories.findMany(result.value.household.id);
    const seededMethods = await paymentMethods.findMany(result.value.household.id);
    const seededFunds = await savingsFunds.findMany(result.value.household.id);

    expect(seededCategories).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(seededMethods).toHaveLength(DEFAULT_PAYMENT_METHODS.length);
    expect(seededFunds).toHaveLength(1);
    expect(seededFunds[0]!.isDefault).toBe(true);
    expect(seededFunds[0]!.currency.equals(NIO)).toBe(true);
  });

  it('NO crea ningún gasto fijo: eso lo declara el usuario', async () => {
    // BootstrapUserUseCase no depende de RecurringExpenseRepository en absoluto;
    // esta prueba documenta la intención (los F01..F05 son del seed de
    // desarrollo, no del alta real de un usuario).
    const result = await useCase.execute(command);
    expect(result.ok).toBe(true);
  });

  it('todas las categorías y métodos nacen marcados como isSystem', async () => {
    const result = await useCase.execute(command);
    if (!result.ok) throw result.error;

    const seededCategories = await categories.findMany(result.value.household.id);
    const seededMethods = await paymentMethods.findMany(result.value.household.id);

    expect(seededCategories.every((c) => c.isSystem)).toBe(true);
    expect(seededMethods.every((m) => m.isSystem)).toBe(true);
  });

  it('es idempotente: repetir la llamada no duplica nada', async () => {
    await useCase.execute(command);
    const second = await useCase.execute(command);
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(await users.findById('user-1')).not.toBeNull();
    expect((await categories.findMany(second.value.household.id)).length).toBe(DEFAULT_CATEGORIES.length);
    expect((await savingsFunds.findMany(second.value.household.id)).length).toBe(1);
    expect((await members.findByHousehold(second.value.household.id)).length).toBe(1);
  });

  it('RN-35: controlStartDate queda fijada en la configuración creada', async () => {
    const result = await useCase.execute(command);
    if (!result.ok) throw result.error;
    expect(result.value.settings.controlStartDate.toISO()).toBe('2026-03-10');
  });
});
