/**
 * `tenantExtension` — CAPA 2 de la triple defensa (CLAUDE.md §7).
 *
 * Inyecta `householdId` en **toda** operación sobre las tablas con
 * discriminante de tenant. Si un repositorio se olvida de filtrar, el filtro
 * se aplica igual. **Esta es la barrera real**: la RLS de Postgres (capa 3) no
 * protege a Prisma, porque el rol `postgres` tiene `rolbypassrls = true`
 * —verificado contra sicfi-dev en la Fase 2—.
 *
 * Sin contexto de tenant, la operación **lanza** en vez de ejecutarse sin
 * filtro. Es la diferencia entre un bug ruidoso y una fuga de datos silenciosa.
 *
 * ── Lo que esta capa NO cubre ────────────────────────────────────────────
 *  · `$queryRaw` / `$executeRaw`: no pasan por `$allModels`. El SQL crudo de
 *    `analytics` (Fase 8) debe filtrar por `household_id` a mano, siempre.
 *  · Escrituras anidadas (`create: { categoria: { create: … } }`): la
 *    extensión solo ve la operación de primer nivel. Hoy no se usan.
 */
import { Prisma } from '@prisma/client';

import type { TenantContext } from '../../domain/tenant-context.port';
import { MissingTenantError } from '../tenant/missing-tenant.error';

/** Tablas cuyo discriminante es la columna `householdId`. */
const HOUSEHOLD_ID_MODELS: ReadonlySet<string> = new Set([
  'BudgetSettings',
  'Category',
  'PaymentMethod',
  'SavingsFund',
  'Period',
  'RecurringExpense',
  'Transaction',
  'AuditLog',
  'HouseholdMember',
  'HouseholdInvite',
]);

/**
 * `Household` también se aísla, pero su discriminante es su propio `id`: sin
 * esto, cualquiera podría leer un household ajeno conociendo su id.
 */
const TENANT_ROOT_MODEL = 'Household';

/**
 * `ExchangeRate` es el caso especial (RN-37): su `householdId` es NULLABLE
 * porque las tasas globales (BCN) se comparten entre todos los households.
 * Filtrar por `householdId = X` a secas escondería justo esas tasas globales y
 * rompería la resolución en cascada del `CurrencyConverter`.
 * Se lee "las mías O las globales"; se escribe solo en las mías.
 */
const SHARED_NULLABLE_MODEL = 'ExchangeRate';

/** Operaciones cuyo `where` apunta a UNA fila por clave única. */
const UNIQUE_WHERE_OPERATIONS: ReadonlySet<string> = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'update',
  'delete',
  'upsert',
]);

/** Operaciones cuyo `where` es un filtro libre. */
const FILTER_WHERE_OPERATIONS: ReadonlySet<string> = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'updateManyAndReturn',
  'deleteMany',
]);

const CREATE_OPERATIONS: ReadonlySet<string> = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
]);

type Args = Record<string, unknown>;

/**
 * Añade el guardia SIN pisar lo que ya pedía quien llamó.
 *
 * En un filtro libre se compone con `AND`, no sobrescribiendo: si el llamante
 * pidió `householdId: 'otro'`, el resultado es `'otro' AND <el mío>` → vacío.
 * Sobrescribir habría convertido esa consulta indebida en una válida sobre MIS
 * datos, ocultando el bug en vez de dejarlo sin resultados.
 */
function andGuard(where: unknown, guard: Args): Args {
  if (where === undefined || where === null) return guard;
  return { AND: [where, guard] };
}

/**
 * Añade el guardia a un `where` de clave única SIN tocar el campo único que
 * puso el llamante — se acumula en `AND`, que `WhereUniqueInput` admite desde
 * Prisma 5.
 *
 * Es la diferencia entre "no encuentras la fila ajena" y "te devuelvo otra
 * fila distinta de la que pediste". Sobrescribir el `id` en `Household` hacía
 * lo segundo: pedir el household de otro devolvía el propio, en silencio.
 */
function andGuardUnique(where: unknown, guard: Args): Args {
  const current = (where as Args | undefined) ?? {};
  const existingAnd = current.AND;
  const accumulated = Array.isArray(existingAnd)
    ? [...(existingAnd as unknown[]), guard]
    : existingAnd
      ? [existingAnd, guard]
      : [guard];

  return { ...current, AND: accumulated };
}

export function tenantExtension(tenant: TenantContext) {
  return Prisma.defineExtension({
    name: 'sicfi-tenant-scope',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          const isHouseholdScoped = model !== undefined && HOUSEHOLD_ID_MODELS.has(model);
          const isTenantRoot = model === TENANT_ROOT_MODEL;
          const isSharedNullable = model === SHARED_NULLABLE_MODEL;

          if (!isHouseholdScoped && !isTenantRoot && !isSharedNullable) {
            return query(args);
          }

          const scope = tenant.current();
          if (!scope) {
            throw new MissingTenantError(model ?? 'desconocido', operation);
          }
          // Ámbito de sistema declarado a propósito (alta, seed, importador).
          if (scope.isSystem) return query(args);

          const householdId = scope.householdId as string;
          const mutable = args as Args;
          const field = isTenantRoot ? 'id' : 'householdId';

          if (UNIQUE_WHERE_OPERATIONS.has(operation)) {
            // El `where` conserva su campo único de primer nivel (Prisma lo
            // exige) y el guardia se acumula en `AND`. Nunca se sobrescribe lo
            // que pidió el llamante: si pide una fila ajena, no encuentra
            // ninguna — no recibe otra distinta.
            mutable.where = andGuardUnique(mutable.where, { [field]: householdId });
          } else if (FILTER_WHERE_OPERATIONS.has(operation)) {
            mutable.where = isSharedNullable
              ? andGuard(mutable.where, { OR: [{ householdId }, { householdId: null }] })
              : andGuard(mutable.where, { [field]: householdId });
          }

          if (CREATE_OPERATIONS.has(operation) && !isTenantRoot) {
            const data = mutable.data;
            mutable.data = Array.isArray(data)
              ? data.map((row) => ({ ...(row as Args), householdId }))
              : { ...((data as Args) ?? {}), householdId };
          }

          // `upsert` crea por la rama `create`, no por `data`.
          if (operation === 'upsert' && !isTenantRoot) {
            mutable.create = { ...((mutable.create as Args) ?? {}), householdId };
          }

          return query(args);
        },
      },
    },
  });
}
