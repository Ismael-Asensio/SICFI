-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('FIJO', 'VARIABLE', 'AHORRO', 'RETIRO_AHORRO', 'INGRESO_EXTRA');

-- CreateEnum
CREATE TYPE "Frequency" AS ENUM ('QUINCENAL', 'MENSUAL', 'BIMESTRAL', 'SEMESTRAL', 'ANUAL');

-- CreateEnum
CREATE TYPE "PeriodHalf" AS ENUM ('Q1', 'Q2');

-- CreateEnum
CREATE TYPE "AppliesTo" AS ENUM ('Q1', 'Q2', 'AMBAS');

-- CreateEnum
CREATE TYPE "TxStatus" AS ENUM ('PAGADO', 'PENDIENTE', 'PROGRAMADO');

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('FIJO', 'VARIABLE', 'AHORRO');

-- CreateEnum
CREATE TYPE "HouseholdRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "ExchangeRateSource" AS ENUM ('MANUAL', 'BCN', 'API');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'es-NI',
    "timezone" TEXT NOT NULL DEFAULT 'America/Managua',
    "active_household_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "households" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "base_currency" CHAR(3) NOT NULL DEFAULT 'NIO',
    "timezone" TEXT NOT NULL DEFAULT 'America/Managua',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "households_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household_members" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "HouseholdRole" NOT NULL DEFAULT 'MEMBER',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "household_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household_invites" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "HouseholdRole" NOT NULL DEFAULT 'MEMBER',
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "household_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_settings" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Mi presupuesto',
    "active_period_override" INTEGER,
    "control_start_date" DATE NOT NULL,
    "spend_threshold" DECIMAL(4,3) NOT NULL DEFAULT 0.80,
    "due_soon_days" INTEGER NOT NULL DEFAULT 3,
    "inactivity_days" INTEGER NOT NULL DEFAULT 5,
    "saving_goal_per_period" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "paid_tolerance_amount" DECIMAL(14,2) NOT NULL DEFAULT 1,
    "disabled_alerts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CategoryKind" NOT NULL DEFAULT 'VARIABLE',
    "color" TEXT,
    "icon" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "savings_funds" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'NIO',
    "target_amount" DECIMAL(14,2),
    "target_date" DATE,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "savings_funds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" TEXT NOT NULL,
    "household_id" TEXT,
    "base_currency" CHAR(3) NOT NULL,
    "quote_currency" CHAR(3) NOT NULL,
    "date" DATE NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "source" "ExchangeRateSource" NOT NULL DEFAULT 'MANUAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "periods" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "half" "PeriodHalf" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "planned_income" DECIMAL(14,2),
    "planned_income_currency" CHAR(3) NOT NULL DEFAULT 'NIO',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_expenses" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'NIO',
    "due_day" INTEGER NOT NULL,
    "frequency" "Frequency" NOT NULL DEFAULT 'QUINCENAL',
    "applies_to" "AppliesTo" NOT NULL,
    "payment_method_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "start_date" DATE,
    "end_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "period_id" TEXT NOT NULL,
    "type" "MovementType" NOT NULL,
    "category_id" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "recurring_expense_id" TEXT,
    "savings_fund_id" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'NIO',
    "exchange_rate" DECIMAL(18,8) NOT NULL DEFAULT 1,
    "base_amount" DECIMAL(14,2) NOT NULL,
    "payment_method_id" TEXT,
    "status" "TxStatus" NOT NULL DEFAULT 'PAGADO',
    "notes" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_user_id_key" ON "profiles"("user_id");

-- CreateIndex
CREATE INDEX "profiles_active_household_id_idx" ON "profiles"("active_household_id");

-- CreateIndex
CREATE INDEX "household_members_user_id_idx" ON "household_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "household_members_household_id_user_id_key" ON "household_members"("household_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "household_invites_token_key" ON "household_invites"("token");

-- CreateIndex
CREATE INDEX "household_invites_household_id_idx" ON "household_invites"("household_id");

-- CreateIndex
CREATE UNIQUE INDEX "household_invites_household_id_email_key" ON "household_invites"("household_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "budget_settings_household_id_year_key" ON "budget_settings"("household_id", "year");

-- CreateIndex
CREATE INDEX "categories_household_id_is_active_idx" ON "categories"("household_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "categories_household_id_name_key" ON "categories"("household_id", "name");

-- CreateIndex
CREATE INDEX "payment_methods_household_id_is_active_idx" ON "payment_methods"("household_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_household_id_name_key" ON "payment_methods"("household_id", "name");

-- CreateIndex
CREATE INDEX "savings_funds_household_id_is_active_idx" ON "savings_funds"("household_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "savings_funds_household_id_name_key" ON "savings_funds"("household_id", "name");

-- CreateIndex
CREATE INDEX "exchange_rates_base_currency_quote_currency_date_idx" ON "exchange_rates"("base_currency", "quote_currency", "date" DESC);

-- CreateIndex
CREATE INDEX "exchange_rates_household_id_base_currency_quote_currency_da_idx" ON "exchange_rates"("household_id", "base_currency", "quote_currency", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_household_id_base_currency_quote_currency_da_key" ON "exchange_rates"("household_id", "base_currency", "quote_currency", "date");

-- CreateIndex
CREATE INDEX "periods_household_id_start_date_end_date_idx" ON "periods"("household_id", "start_date", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "periods_household_id_year_number_key" ON "periods"("household_id", "year", "number");

-- CreateIndex
CREATE INDEX "recurring_expenses_household_id_is_active_applies_to_idx" ON "recurring_expenses"("household_id", "is_active", "applies_to");

-- CreateIndex
CREATE INDEX "recurring_expenses_household_id_category_id_idx" ON "recurring_expenses"("household_id", "category_id");

-- CreateIndex
CREATE INDEX "recurring_expenses_household_id_payment_method_id_idx" ON "recurring_expenses"("household_id", "payment_method_id");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_expenses_household_id_code_key" ON "recurring_expenses"("household_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_expenses_household_id_concept_key" ON "recurring_expenses"("household_id", "concept");

-- CreateIndex
CREATE INDEX "transactions_household_id_date_idx" ON "transactions"("household_id", "date" DESC);

-- CreateIndex
CREATE INDEX "transactions_household_id_period_id_type_idx" ON "transactions"("household_id", "period_id", "type");

-- CreateIndex
CREATE INDEX "transactions_household_id_category_id_idx" ON "transactions"("household_id", "category_id");

-- CreateIndex
CREATE INDEX "transactions_household_id_recurring_expense_id_period_id_idx" ON "transactions"("household_id", "recurring_expense_id", "period_id");

-- CreateIndex
CREATE INDEX "transactions_household_id_savings_fund_id_idx" ON "transactions"("household_id", "savings_fund_id");

-- CreateIndex
CREATE INDEX "transactions_household_id_payment_method_id_idx" ON "transactions"("household_id", "payment_method_id");

-- CreateIndex
CREATE INDEX "transactions_created_by_user_id_idx" ON "transactions"("created_by_user_id");

-- CreateIndex
CREATE INDEX "audit_logs_household_id_at_idx" ON "audit_logs"("household_id", "at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_household_id_entity_entity_id_idx" ON "audit_logs"("household_id", "entity", "entity_id");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_active_household_id_fkey" FOREIGN KEY ("active_household_id") REFERENCES "households"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_invites" ADD CONSTRAINT "household_invites_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_settings" ADD CONSTRAINT "budget_settings_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "savings_funds" ADD CONSTRAINT "savings_funds_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periods" ADD CONSTRAINT "periods_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_recurring_expense_id_fkey" FOREIGN KEY ("recurring_expense_id") REFERENCES "recurring_expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_savings_fund_id_fkey" FOREIGN KEY ("savings_fund_id") REFERENCES "savings_funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

