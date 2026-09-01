-- Invariantes que el esquema de Prisma no puede expresar.
--
-- Prisma no modela CHECK constraints, así que no los incluye en sus diffs: estas
-- restricciones sobreviven a los `migrate dev` posteriores.
--
-- Criterio para incluir una regla aquí: solo las que NUNCA pueden tener una
-- excepción legítima. Las reglas con casos borde (p. ej. RN-26, que el importador
-- de la Fase 12 podría encontrar incumplida en un Excel real) se validan en el
-- dominio, donde pueden devolver un error explicativo en lugar de un 500.

-- ── RN-39 (D3): un movimiento de ahorro sin fondo rompe el cálculo del saldo ──
ALTER TABLE "transactions"
  ADD CONSTRAINT "tx_savings_requires_fund"
  CHECK (
    "type" NOT IN ('AHORRO', 'RETIRO_AHORRO')
    OR "savings_fund_id" IS NOT NULL
  );

-- ── Un movimiento que NO es de ahorro no debe apuntar a un fondo ──
ALTER TABLE "transactions"
  ADD CONSTRAINT "tx_fund_only_for_savings"
  CHECK (
    "type" IN ('AHORRO', 'RETIRO_AHORRO')
    OR "savings_fund_id" IS NULL
  );

-- ── El signo lo lleva `type`, nunca el importe ──
-- Sin esto, un usuario que teclea -500 para "devolver" corrompe en silencio
-- todos los agregados. Una devolución se modela como INGRESO_EXTRA.
ALTER TABLE "transactions"
  ADD CONSTRAINT "tx_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "transactions"
  ADD CONSTRAINT "tx_base_amount_positive" CHECK ("base_amount" > 0);

-- ── RN-36/RN-37: una tasa de cambio de 0 o negativa no existe ──
ALTER TABLE "transactions"
  ADD CONSTRAINT "tx_exchange_rate_positive" CHECK ("exchange_rate" > 0);

ALTER TABLE "exchange_rates"
  ADD CONSTRAINT "rate_positive" CHECK ("rate" > 0);

-- ── Monedas ISO 4217: exactamente tres mayúsculas ──
ALTER TABLE "transactions"
  ADD CONSTRAINT "tx_currency_iso" CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "households"
  ADD CONSTRAINT "household_base_currency_iso" CHECK ("base_currency" ~ '^[A-Z]{3}$');

ALTER TABLE "savings_funds"
  ADD CONSTRAINT "fund_currency_iso" CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "exchange_rates"
  ADD CONSTRAINT "rate_currencies_iso" CHECK (
    "base_currency" ~ '^[A-Z]{3}$' AND "quote_currency" ~ '^[A-Z]{3}$'
  );

-- ── Una tasa de una moneda contra sí misma no tiene sentido ──
ALTER TABLE "exchange_rates"
  ADD CONSTRAINT "rate_currencies_differ" CHECK ("base_currency" <> "quote_currency");

-- ── RN-01/RN-02: 24 quincenas, 12 meses, y el inicio precede al fin ──
ALTER TABLE "periods"
  ADD CONSTRAINT "period_number_range" CHECK ("number" BETWEEN 1 AND 24);

ALTER TABLE "periods"
  ADD CONSTRAINT "period_month_range" CHECK ("month" BETWEEN 1 AND 12);

ALTER TABLE "periods"
  ADD CONSTRAINT "period_dates_ordered" CHECK ("start_date" < "end_date");

-- ── El número de quincena y el mes tienen que ser coherentes entre sí ──
-- number = (month − 1) × 2 + (half = Q1 ? 1 : 2)
ALTER TABLE "periods"
  ADD CONSTRAINT "period_number_matches_month" CHECK (
    "number" = ("month" - 1) * 2 + (CASE WHEN "half" = 'Q1' THEN 1 ELSE 2 END)
  );

ALTER TABLE "periods"
  ADD CONSTRAINT "period_planned_income_positive" CHECK (
    "planned_income" IS NULL OR "planned_income" >= 0
  );

-- ── RN-21: día de pago dentro de un mes real ──
-- El recorte a min(dueDay, díaFinQuincena) lo hace el dominio; aquí solo se
-- impide un valor imposible como 0 o 35.
ALTER TABLE "recurring_expenses"
  ADD CONSTRAINT "recurring_due_day_range" CHECK ("due_day" BETWEEN 1 AND 31);

ALTER TABLE "recurring_expenses"
  ADD CONSTRAINT "recurring_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "recurring_expenses"
  ADD CONSTRAINT "recurring_currency_iso" CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "recurring_expenses"
  ADD CONSTRAINT "recurring_dates_ordered" CHECK (
    "start_date" IS NULL OR "end_date" IS NULL OR "start_date" <= "end_date"
  );

-- ── Config: el umbral de gasto es una fracción, no un porcentaje ──
ALTER TABLE "budget_settings"
  ADD CONSTRAINT "settings_threshold_fraction" CHECK ("spend_threshold" BETWEEN 0 AND 1);

ALTER TABLE "budget_settings"
  ADD CONSTRAINT "settings_active_period_range" CHECK (
    "active_period_override" IS NULL OR "active_period_override" BETWEEN 1 AND 24
  );

ALTER TABLE "budget_settings"
  ADD CONSTRAINT "settings_days_positive" CHECK (
    "due_soon_days" >= 0 AND "inactivity_days" >= 0
  );

ALTER TABLE "budget_settings"
  ADD CONSTRAINT "settings_amounts_non_negative" CHECK (
    "saving_goal_per_period" >= 0 AND "paid_tolerance_amount" >= 0
  );

-- ── Fondos de ahorro: una meta de 0 o negativa no es una meta ──
ALTER TABLE "savings_funds"
  ADD CONSTRAINT "fund_target_positive" CHECK (
    "target_amount" IS NULL OR "target_amount" > 0
  );
