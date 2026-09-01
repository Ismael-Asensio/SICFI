-- ═══════════════════════════════════════════════════════════════════════════
--  SICFI — Row Level Security (CAPA 3 de la triple defensa)
--
--  ⚠️  ADVERTENCIA IMPORTANTE, LEER ANTES DE CONFIAR EN ESTE ARCHIVO
--
--  Estas políticas NO protegen las consultas de Prisma. Verificado empíricamente
--  contra sicfi-dev el 2026-08-31:
--
--    current_user = postgres
--    pg_roles: postgres  → rolsuper = false, rolbypassrls = TRUE
--              authenticated → rolbypassrls = false
--    pg_tables: todas las tablas de public son propiedad de postgres
--
--  `rolbypassrls = true` hace que el rol se salte TODA seguridad de fila,
--  incluido `FORCE ROW LEVEL SECURITY`. Como Prisma se conecta con ese rol,
--  ninguna política de este archivo afecta a la aplicación.
--
--  La barrera real del aislamiento entre households es la CAPA 2:
--  `shared/infrastructure/prisma/tenant.extension.ts` (Fase 5), que inyecta
--  `household_id` en toda operación. Estas políticas son defensa en profundidad
--  y protegen el acceso por el cliente de Supabase, PostgREST y SQL manual —
--  que es exactamente donde ocurren las fugas por descuido.
--
--  Nunca desactives la capa 2 "temporalmente para depurar".
--
--  Se conserva `FORCE` a propósito: si algún día se le revoca BYPASSRLS al rol
--  `postgres`, la propiedad de la tabla por sí sola no debe bastar para saltarse
--  las políticas. Hoy es un no-op.
--
--  Aplicar con:
--    pnpm exec ts-node --compiler-options '{"module":"CommonJS"}' \
--      prisma/scripts/apply-sql.ts prisma/sql/rls-policies.sql
--  Es idempotente: se puede correr tras cada migración.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
--  Función auxiliar: households a los que pertenece el usuario del JWT.
--
--  STABLE + SECURITY DEFINER para que el planner la cachee dentro de la consulta
--  y para que pueda leer `household_members` sin recursión de políticas.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sicfi_current_households()
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT household_id
  FROM public.household_members
  WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.sicfi_current_households() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sicfi_current_households() TO authenticated;

-- ───────────────────────────────────────────────────────────────────────────
--  Tablas con discriminante `household_id` — aislamiento por pertenencia.
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  target_table text;
  tenant_tables text[] := ARRAY[
    'budget_settings',
    'categories',
    'payment_methods',
    'savings_funds',
    'periods',
    'recurring_expenses',
    'transactions',
    'exchange_rates',
    'audit_logs',
    'household_invites'
  ];
BEGIN
  FOREACH target_table IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', target_table);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', target_table);
    EXECUTE format($pol$
      CREATE POLICY tenant_isolation ON public.%I
        FOR ALL
        TO authenticated
        USING (household_id IN (SELECT public.sicfi_current_households()))
        WITH CHECK (household_id IN (SELECT public.sicfi_current_households()))
    $pol$, target_table);
  END LOOP;
END $$;

-- `exchange_rates.household_id` es NULLABLE: las tasas globales (BCN) se comparten
-- entre todos los households. La política anterior las ocultaría, porque
-- `NULL IN (...)` es NULL, no TRUE. Se reemplaza por una que las admita en
-- lectura pero exija household propio en escritura (RN-37).
DROP POLICY IF EXISTS tenant_isolation ON public.exchange_rates;

CREATE POLICY exchange_rates_read ON public.exchange_rates
  FOR SELECT
  TO authenticated
  USING (
    household_id IS NULL
    OR household_id IN (SELECT public.sicfi_current_households())
  );

CREATE POLICY exchange_rates_write ON public.exchange_rates
  FOR ALL
  TO authenticated
  USING (household_id IN (SELECT public.sicfi_current_households()))
  WITH CHECK (household_id IN (SELECT public.sicfi_current_households()));

-- ───────────────────────────────────────────────────────────────────────────
--  households — visible solo si el usuario es miembro.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.households FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS household_membership ON public.households;
CREATE POLICY household_membership ON public.households
  FOR ALL
  TO authenticated
  USING (id IN (SELECT public.sicfi_current_households()))
  WITH CHECK (id IN (SELECT public.sicfi_current_households()));

-- ───────────────────────────────────────────────────────────────────────────
--  household_members — un usuario ve las membresías de sus propios households.
--
--  La política consulta la función SECURITY DEFINER en lugar de la tabla misma
--  para no entrar en recursión infinita de políticas.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS member_visibility ON public.household_members;
CREATE POLICY member_visibility ON public.household_members
  FOR ALL
  TO authenticated
  USING (household_id IN (SELECT public.sicfi_current_households()))
  WITH CHECK (household_id IN (SELECT public.sicfi_current_households()));

-- ───────────────────────────────────────────────────────────────────────────
--  users / profiles — cada quien ve lo suyo.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS own_user ON public.users;
CREATE POLICY own_user ON public.users
  FOR ALL
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS own_profile ON public.profiles;
CREATE POLICY own_profile ON public.profiles
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ───────────────────────────────────────────────────────────────────────────
--  Verificación: lista las tablas SIN RLS. El resultado debe ser vacío
--  salvo `_prisma_migrations`.
-- ───────────────────────────────────────────────────────────────────────────
-- SELECT tablename
-- FROM pg_tables
-- WHERE schemaname = 'public' AND NOT rowsecurity;
