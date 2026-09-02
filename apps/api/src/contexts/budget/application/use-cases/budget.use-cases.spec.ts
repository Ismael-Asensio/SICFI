import { beforeEach, describe, expect, it } from 'vitest';

import { CalendarDate } from '../../../../shared/domain/calendar-date.vo';
import { Currency } from '../../../../shared/domain/currency.vo';
import { FixedClock } from '../../../../shared/infrastructure/clock/system-clock.adapter';
import { Money } from '../../../../shared/domain/money.vo';
import { InMemoryBudgetSettingsRepository, InMemoryPeriodRepository } from '../../../../../test/doubles/budget.doubles';
import { InMemoryHouseholdRepository } from '../../../../../test/doubles/iam.doubles';
import { SequentialIdGenerator } from '../../../../../test/doubles/id-generator.double';
import { Household } from '../../../iam/domain/household.entity';

import { CreateBudgetSettingsUseCase } from './create-budget-settings.use-case';
import { GetActivePeriodUseCase } from './get-active-period.use-case';
import { ListPeriodsUseCase } from './list-periods.use-case';
import { SetPeriodPlannedIncomeUseCase } from './set-period-planned-income.use-case';
import { UpdateBudgetSettingsUseCase } from './update-budget-settings.use-case';

const HOUSEHOLD = 'hh-1';
const NIO = Currency.NIO;
const date = (iso: string): CalendarDate => {
  const result = CalendarDate.fromISO(iso);
  if (!result.ok) throw result.error;
  return result.value;
};

describe('CreateBudgetSettingsUseCase', () => {
  let settingsRepo: InMemoryBudgetSettingsRepository;
  let periodsRepo: InMemoryPeriodRepository;
  let useCase: CreateBudgetSettingsUseCase;

  beforeEach(() => {
    settingsRepo = new InMemoryBudgetSettingsRepository();
    periodsRepo = new InMemoryPeriodRepository();
    useCase = new CreateBudgetSettingsUseCase(settingsRepo, periodsRepo, new SequentialIdGenerator());
  });

  it('crea la configuración y las 24 quincenas del año', async () => {
    const result = await useCase.execute({
      householdId: HOUSEHOLD,
      year: 2026,
      baseCurrency: NIO,
      controlStartDate: date('2026-01-01'),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.periods).toHaveLength(24);
      expect(result.value.settings.year).toBe(2026);
      expect(result.value.settings.spendThreshold.toNumber()).toBeCloseTo(0.8, 10);
    }

    expect(await periodsRepo.findByYear(HOUSEHOLD, 2026)).toHaveLength(24);
  });

  it('las quincenas nacen sin ingreso planificado (corrige P12)', async () => {
    const result = await useCase.execute({
      householdId: HOUSEHOLD,
      year: 2026,
      baseCurrency: NIO,
      controlStartDate: date('2026-01-01'),
    });
    expect(result.ok && result.value.periods.every((p) => p.plannedIncome === null)).toBe(true);
  });

  it('rechaza crear dos configuraciones para el mismo año', async () => {
    await useCase.execute({
      householdId: HOUSEHOLD,
      year: 2026,
      baseCurrency: NIO,
      controlStartDate: date('2026-01-01'),
    });
    const result = await useCase.execute({
      householdId: HOUSEHOLD,
      year: 2026,
      baseCurrency: NIO,
      controlStartDate: date('2026-01-01'),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CONFLICT');
  });
});

describe('UpdateBudgetSettingsUseCase', () => {
  it('actualiza el umbral y valida el rango del override', async () => {
    const settingsRepo = new InMemoryBudgetSettingsRepository();
    const periodsRepo = new InMemoryPeriodRepository();
    const create = new CreateBudgetSettingsUseCase(settingsRepo, periodsRepo, new SequentialIdGenerator());
    const update = new UpdateBudgetSettingsUseCase(settingsRepo);

    await create.execute({
      householdId: HOUSEHOLD,
      year: 2026,
      baseCurrency: NIO,
      controlStartDate: date('2026-01-01'),
    });

    const invalid = await update.execute({ householdId: HOUSEHOLD, year: 2026, activePeriodOverride: 25 });
    expect(invalid.ok).toBe(false);

    const result = await update.execute({
      householdId: HOUSEHOLD,
      year: 2026,
      activePeriodOverride: 5,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.activePeriodOverride).toBe(5);
  });
});

describe('SetPeriodPlannedIncomeUseCase', () => {
  it('declara el ingreso de una quincena concreta', async () => {
    const settingsRepo = new InMemoryBudgetSettingsRepository();
    const periodsRepo = new InMemoryPeriodRepository();
    const create = new CreateBudgetSettingsUseCase(settingsRepo, periodsRepo, new SequentialIdGenerator());
    const setIncome = new SetPeriodPlannedIncomeUseCase(periodsRepo);

    const created = await create.execute({
      householdId: HOUSEHOLD,
      year: 2026,
      baseCurrency: NIO,
      controlStartDate: date('2026-01-01'),
    });
    if (!created.ok) throw created.error;

    const firstPeriod = created.value.periods[0]!;
    const result = await setIncome.execute({
      householdId: HOUSEHOLD,
      periodId: firstPeriod.id,
      plannedIncome: Money.unsafe('8500', NIO),
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.plannedIncome?.toFixed()).toBe('8500.00');
  });

  it('rechaza un ingreso cero o negativo', async () => {
    const periodsRepo = new InMemoryPeriodRepository();
    const setIncome = new SetPeriodPlannedIncomeUseCase(periodsRepo);
    const settingsRepo = new InMemoryBudgetSettingsRepository();
    const create = new CreateBudgetSettingsUseCase(settingsRepo, periodsRepo, new SequentialIdGenerator());

    const created = await create.execute({
      householdId: HOUSEHOLD,
      year: 2026,
      baseCurrency: NIO,
      controlStartDate: date('2026-01-01'),
    });
    if (!created.ok) throw created.error;

    const result = await setIncome.execute({
      householdId: HOUSEHOLD,
      periodId: created.value.periods[0]!.id,
      plannedIncome: Money.zero(NIO),
    });
    expect(result.ok).toBe(false);
  });
});

describe('ListPeriodsUseCase', () => {
  it('devuelve las quincenas ordenadas por número', async () => {
    const settingsRepo = new InMemoryBudgetSettingsRepository();
    const periodsRepo = new InMemoryPeriodRepository();
    const create = new CreateBudgetSettingsUseCase(settingsRepo, periodsRepo, new SequentialIdGenerator());
    const list = new ListPeriodsUseCase(periodsRepo);

    await create.execute({
      householdId: HOUSEHOLD,
      year: 2026,
      baseCurrency: NIO,
      controlStartDate: date('2026-01-01'),
    });

    const periods = await list.execute({ householdId: HOUSEHOLD, year: 2026 });
    expect(periods.map((p) => p.number)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
  });
});

describe('GetActivePeriodUseCase — RN-04', () => {
  let householdsRepo: InMemoryHouseholdRepository;
  let settingsRepo: InMemoryBudgetSettingsRepository;
  let periodsRepo: InMemoryPeriodRepository;

  beforeEach(async () => {
    householdsRepo = new InMemoryHouseholdRepository();
    settingsRepo = new InMemoryBudgetSettingsRepository();
    periodsRepo = new InMemoryPeriodRepository();

    await householdsRepo.save(
      new Household({ id: HOUSEHOLD, name: 'Hogar', baseCurrency: NIO, timezone: 'America/Managua' })
    );

    const create = new CreateBudgetSettingsUseCase(settingsRepo, periodsRepo, new SequentialIdGenerator());
    await create.execute({
      householdId: HOUSEHOLD,
      year: 2026,
      baseCurrency: NIO,
      controlStartDate: date('2026-01-01'),
    });
  });

  it('resuelve la quincena que contiene hoy en la zona del household', async () => {
    // 2026-03-10 12:00 UTC cae claramente dentro del 10 de marzo en Managua (UTC-6).
    const clock = FixedClock.atISO('2026-03-10T12:00:00Z');
    const useCase = new GetActivePeriodUseCase(householdsRepo, settingsRepo, periodsRepo, clock);

    const result = await useCase.execute({ householdId: HOUSEHOLD, year: 2026 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.month).toBe(3);
      expect(result.value.half).toBe('Q1');
    }
  });

  it('usa el override manual cuando está configurado', async () => {
    const update = new UpdateBudgetSettingsUseCase(settingsRepo);
    await update.execute({ householdId: HOUSEHOLD, year: 2026, activePeriodOverride: 20 });

    const clock = FixedClock.atISO('2026-01-01T12:00:00Z'); // sin el override, sería la quincena 1
    const useCase = new GetActivePeriodUseCase(householdsRepo, settingsRepo, periodsRepo, clock);

    const result = await useCase.execute({ householdId: HOUSEHOLD, year: 2026 });
    expect(result.ok && result.value.number).toBe(20);
  });

  it('la zona horaria del household decide, no UTC (corrige P4)', async () => {
    // 2026-01-15 23:30 en Managua (UTC-6) = 2026-01-16 05:30 UTC.
    // En Managua sigue siendo Q1 (día 15); en UTC ya sería Q2.
    const clock = FixedClock.atISO('2026-01-16T05:30:00Z');
    const useCase = new GetActivePeriodUseCase(householdsRepo, settingsRepo, periodsRepo, clock);

    const result = await useCase.execute({ householdId: HOUSEHOLD, year: 2026 });
    expect(result.ok && result.value.half).toBe('Q1');
  });
});
