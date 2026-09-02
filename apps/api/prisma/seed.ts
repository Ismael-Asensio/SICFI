/**
 * Seed de desarrollo de SICFI.
 *
 * Crea un household completo y listo para usar:
 *   · 1 usuario + perfil + membresía OWNER
 *   · 24 categorías, 7 métodos de pago, 1 fondo de ahorro   (hoja `Listas`)
 *   · BudgetSettings de 2026                                 (hoja `Config`)
 *   · 24 quincenas con ingreso planificado de C$ 8 500       (hoja `Quincenas`)
 *   · 5 gastos fijos                                         (hoja `Fijos`)
 *
 * Idempotente: se puede correr N veces sobre la misma base sin duplicar nada.
 * Ejecutar con `pnpm db:seed`.
 */
import { PrismaClient } from '@prisma/client';

import {
  BUDGET_DEFAULTS,
  CATEGORIES,
  DEFAULT_SAVINGS_FUND,
  PAYMENT_METHODS,
  RECURRING_EXPENSES,
} from './seed-data';
import { PeriodFactory } from '../src/contexts/budget/domain/period-factory.service';
import { DueDay } from '../src/contexts/recurring/domain/due-day.vo';
import { RecurringExpense } from '../src/contexts/recurring/domain/recurring-expense.entity';
import { CalendarDate } from '../src/shared/domain/calendar-date.vo';

const prisma = new PrismaClient();

/** Usuario de desarrollo. En producción el id viene del `sub` del JWT de Supabase. */
const SEED_USER = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'dev@sicfi.local',
  displayName: 'Usuario de desarrollo',
} as const;

const SEED_HOUSEHOLD_NAME = 'Hogar de desarrollo';

// ─────────────────────────────── Seed ───────────────────────────────

async function main(): Promise<void> {
  console.log('Sembrando datos de desarrollo…\n');

  // ── Usuario y household ──
  const user = await prisma.user.upsert({
    where: { id: SEED_USER.id },
    update: { email: SEED_USER.email },
    create: { id: SEED_USER.id, email: SEED_USER.email },
  });

  // El household no tiene clave natural, así que se busca por nombre para
  // mantener la idempotencia sin fijar un cuid a mano.
  const household =
    (await prisma.household.findFirst({ where: { name: SEED_HOUSEHOLD_NAME } })) ??
    (await prisma.household.create({
      data: { name: SEED_HOUSEHOLD_NAME, baseCurrency: 'NIO', timezone: 'America/Managua' },
    }));

  await prisma.householdMember.upsert({
    where: { householdId_userId: { householdId: household.id, userId: user.id } },
    update: { role: 'OWNER' },
    create: { householdId: household.id, userId: user.id, role: 'OWNER' },
  });

  await prisma.profile.upsert({
    where: { userId: user.id },
    update: { activeHouseholdId: household.id },
    create: {
      userId: user.id,
      displayName: SEED_USER.displayName,
      activeHouseholdId: household.id,
    },
  });

  console.log(`  Household  "${household.name}" (${household.id})`);

  // ── Catálogos (hoja Listas) ──
  for (const [index, category] of CATEGORIES.entries()) {
    await prisma.category.upsert({
      where: { householdId_name: { householdId: household.id, name: category.name } },
      update: { kind: category.kind, sortOrder: index },
      create: {
        householdId: household.id,
        name: category.name,
        kind: category.kind,
        isSystem: true,
        sortOrder: index,
      },
    });
  }
  console.log(`  Categorías        ${CATEGORIES.length}`);

  for (const [index, name] of PAYMENT_METHODS.entries()) {
    await prisma.paymentMethod.upsert({
      where: { householdId_name: { householdId: household.id, name } },
      update: { sortOrder: index },
      create: { householdId: household.id, name, isSystem: true, sortOrder: index },
    });
  }
  console.log(`  Métodos de pago   ${PAYMENT_METHODS.length}`);

  await prisma.savingsFund.upsert({
    where: {
      householdId_name: { householdId: household.id, name: DEFAULT_SAVINGS_FUND.name },
    },
    update: {},
    create: {
      householdId: household.id,
      name: DEFAULT_SAVINGS_FUND.name,
      currency: DEFAULT_SAVINGS_FUND.currency,
      isDefault: true,
    },
  });
  console.log('  Fondos de ahorro  1');

  // ── Configuración del año (hoja Config) ──
  const { year } = BUDGET_DEFAULTS;

  await prisma.budgetSettings.upsert({
    where: { householdId_year: { householdId: household.id, year } },
    update: {},
    create: {
      householdId: household.id,
      year,
      name: BUDGET_DEFAULTS.name,
      // RN-35: sin esta fecha, un usuario nuevo recibe decenas de falsos
      // "olvidaste pagar" por todas las quincenas ya pasadas del año.
      controlStartDate: CalendarDate.unsafe(year, 1, 1).toUtcDate(),
      spendThreshold: BUDGET_DEFAULTS.spendThreshold,
      dueSoonDays: BUDGET_DEFAULTS.dueSoonDays,
      inactivityDays: BUDGET_DEFAULTS.inactivityDays,
      savingGoalPerPeriod: BUDGET_DEFAULTS.savingGoalPerPeriod,
      paidToleranceAmount: BUDGET_DEFAULTS.paidToleranceAmount,
    },
  });
  console.log(`  BudgetSettings    ${year}`);

  // ── Quincenas (hoja Quincenas) ──
  const periods = PeriodFactory.buildYear(year);

  for (const period of periods) {
    await prisma.period.upsert({
      where: { householdId_year_number: { householdId: household.id, year, number: period.number } },
      update: {
        month: period.month,
        half: period.half,
        startDate: period.startDate.toUtcDate(),
        endDate: period.endDate.toUtcDate(),
      },
      create: {
        householdId: household.id,
        year,
        number: period.number,
        month: period.month,
        half: period.half,
        startDate: period.startDate.toUtcDate(),
        endDate: period.endDate.toUtcDate(),
        plannedIncome: BUDGET_DEFAULTS.plannedIncomePerPeriod,
        plannedIncomeCurrency: 'NIO',
      },
    });
  }
  console.log(`  Quincenas         ${periods.length}`);

  // ── Gastos fijos (hoja Fijos) ──
  for (const fixed of RECURRING_EXPENSES) {
    const category = await prisma.category.findUniqueOrThrow({
      where: { householdId_name: { householdId: household.id, name: fixed.categoryName } },
    });
    const paymentMethod = await prisma.paymentMethod.findUniqueOrThrow({
      where: { householdId_name: { householdId: household.id, name: fixed.paymentMethodName } },
    });

    await prisma.recurringExpense.upsert({
      where: { householdId_code: { householdId: household.id, code: fixed.code } },
      update: {
        amount: fixed.amount,
        dueDay: fixed.dueDay,
        frequency: fixed.frequency,
        appliesTo: RecurringExpense.deriveAppliesTo(fixed.frequency, DueDay.unsafe(fixed.dueDay)),
        categoryId: category.id,
        paymentMethodId: paymentMethod.id,
      },
      create: {
        householdId: household.id,
        code: fixed.code,
        concept: fixed.concept,
        amount: fixed.amount,
        currency: 'NIO',
        dueDay: fixed.dueDay,
        frequency: fixed.frequency,
        appliesTo: RecurringExpense.deriveAppliesTo(fixed.frequency, DueDay.unsafe(fixed.dueDay)),
        categoryId: category.id,
        paymentMethodId: paymentMethod.id,
        isActive: true,
      },
    });
  }
  console.log(`  Gastos fijos      ${RECURRING_EXPENSES.length}`);

  // ── Resumen financiero: la tensión que el producto existe para hacer visible ──
  const monthlyFixed = RECURRING_EXPENSES.reduce((total, fixed) => {
    // RN-19: costoMensual = quincenal ? monto × 2 : monto
    const multiplier = fixed.frequency === 'QUINCENAL' ? 2 : 1;
    return total + Number(fixed.amount) * multiplier;
  }, 0);
  const monthlyIncome = Number(BUDGET_DEFAULTS.plannedIncomePerPeriod) * 2;
  const committed = (monthlyFixed / monthlyIncome) * 100;

  console.log(
    `\n  Fijos C$ ${monthlyFixed.toLocaleString('es-NI')}/mes sobre ingreso ` +
      `C$ ${monthlyIncome.toLocaleString('es-NI')}/mes → ${committed.toFixed(1)} % comprometido`
  );
  console.log('\nSeed completado.');
}

main()
  .catch((error: unknown) => {
    console.error('El seed falló:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
