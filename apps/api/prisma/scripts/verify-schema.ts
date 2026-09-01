/**
 * Verificación post-migración. Comprueba contra la base real lo que el DoD de la
 * Fase 2 pide: datos sembrados, RLS activo, CHECK constraints en su sitio y los
 * agregados del Excel cuadrando.
 *
 *   pnpm exec ts-node --compiler-options '{"module":"CommonJS"}' \
 *     prisma/scripts/verify-schema.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

let failures = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const ok = String(actual) === String(expected);
  if (!ok) failures += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${label}: ${String(actual)}${ok ? '' : ` (se esperaba ${String(expected)})`}`);
}

async function main(): Promise<void> {
  console.log('\n── Datos sembrados ──');
  check('categorías', await prisma.category.count(), 24);
  check('métodos de pago', await prisma.paymentMethod.count(), 7);
  check('fondos de ahorro', await prisma.savingsFund.count(), 1);
  check('quincenas', await prisma.period.count(), 24);
  check('gastos fijos', await prisma.recurringExpense.count(), 5);
  check('households', await prisma.household.count(), 1);
  check('miembros', await prisma.householdMember.count(), 1);

  console.log('\n── Calendario de quincenas (RN-01, RN-02) ──');
  const periods = await prisma.period.findMany({ orderBy: { number: 'asc' } });
  const first = periods[0];
  const febQ2 = periods.find((p) => p.month === 2 && p.half === 'Q2');
  const last = periods[periods.length - 1];
  const iso = (d: Date | null | undefined) => d?.toISOString().slice(0, 10) ?? '—';

  check('Q1 de enero empieza', iso(first?.startDate), '2026-01-01');
  check('Q2 de febrero termina', iso(febQ2?.endDate), '2026-02-28');
  check('Q2 de diciembre termina', iso(last?.endDate), '2026-12-31');
  check(
    'ingreso planificado por quincena',
    periods[0]?.plannedIncome?.toFixed(2),
    '8500.00'
  );

  console.log('\n── appliesTo derivado (RN-18) ──');
  const fixed = await prisma.recurringExpense.findMany({ orderBy: { code: 'asc' } });
  for (const f of fixed) {
    const expected = f.frequency === 'QUINCENAL' ? 'AMBAS' : f.dueDay <= 15 ? 'Q1' : 'Q2';
    check(`${f.code} ${f.concept}`, f.appliesTo, expected);
  }

  console.log('\n── Agregados del Excel (§1.5) ──');
  // RN-19: costoMensual = inactivo ? 0 : (quincenal ? monto × 2 : monto)
  const monthly = fixed.reduce(
    (total, f) => total + (f.isActive ? Number(f.amount) * (f.frequency === 'QUINCENAL' ? 2 : 1) : 0),
    0
  );
  check('fijos C$/mes', monthly.toFixed(2), '12100.00');
  check('fijos C$/año', (monthly * 12).toFixed(2), '145200.00');
  const income = Number(periods[0]?.plannedIncome ?? 0) * 24;
  check('ingreso anual C$', income.toFixed(2), '204000.00');
  check('% comprometido', (((monthly * 12) / income) * 100).toFixed(1), '71.2');

  console.log('\n── Precisión decimal (nada de floats) ──');
  const amounts = fixed.map((f) => f.amount.toFixed(2));
  check('importes exactos', amounts.join(','), '2500.00,2400.00,400.00,400.00,700.00');

  console.log('\n── Row Level Security ──');
  const noRls = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND NOT rowsecurity AND tablename <> '_prisma_migrations'
     ORDER BY tablename`
  );
  check('tablas sin RLS', noRls.map((t) => t.tablename).join(',') || '(ninguna)', '(ninguna)');

  const policies = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*)::bigint AS n FROM pg_policies WHERE schemaname = 'public'`
  );
  check('políticas creadas', Number(policies[0]?.n ?? 0) >= 15, true);

  console.log('\n── CHECK constraints ──');
  const constraints = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*)::bigint AS n
     FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
     WHERE c.contype = 'c' AND n.nspname = 'public'
       AND c.conname NOT LIKE '%_not_null'`
  );
  check('constraints presentes', Number(constraints[0]?.n ?? 0) >= 20, true);

  // RN-39: un movimiento de ahorro sin fondo debe ser rechazado por la base.
  const household = await prisma.household.findFirstOrThrow();
  const period = await prisma.period.findFirstOrThrow();
  const category = await prisma.category.findFirstOrThrow();
  const user = await prisma.user.findFirstOrThrow();

  let rejected = false;
  try {
    await prisma.transaction.create({
      data: {
        householdId: household.id,
        date: new Date(Date.UTC(2026, 0, 5, 12)),
        periodId: period.id,
        type: 'AHORRO',
        categoryId: category.id,
        concept: 'Prueba que debe fallar',
        amount: '100.00',
        baseAmount: '100.00',
        createdByUserId: user.id,
        // savingsFundId ausente a propósito
      },
    });
  } catch {
    rejected = true;
  }
  check('AHORRO sin fondo rechazado (RN-39)', rejected, true);

  let negativeRejected = false;
  try {
    await prisma.recurringExpense.create({
      data: {
        householdId: household.id,
        code: 'F99',
        concept: 'Importe negativo',
        amount: '-100.00',
        dueDay: 5,
        frequency: 'MENSUAL',
        appliesTo: 'Q1',
        categoryId: category.id,
      },
    });
  } catch {
    negativeRejected = true;
  }
  check('importe negativo rechazado', negativeRejected, true);

  console.log(
    failures === 0
      ? '\n✅ Todas las comprobaciones pasaron.\n'
      : `\n❌ ${failures} comprobación(es) fallaron.\n`
  );
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error('La verificación falló:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
