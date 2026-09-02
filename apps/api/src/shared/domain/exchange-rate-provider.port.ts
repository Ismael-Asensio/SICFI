/**
 * Puerto `ExchangeRateProvider`.
 *
 * El adaptador (Fase 5) implementa la resolución de RN-37: busca la tasa de la
 * fecha exacta y, si no existe, la más reciente **anterior**; primero la del
 * household y luego la global (`household_id IS NULL`, p. ej. importada del BCN).
 *
 * Devuelve `null` cuando no hay ninguna tasa aplicable. Quien decide qué hacer
 * con esa ausencia es `CurrencyConverter`, no el adaptador.
 */
import type { CalendarDate } from './calendar-date.vo';
import type { Currency } from './currency.vo';
import type { ExchangeRate } from './exchange-rate.vo';

export const EXCHANGE_RATE_PROVIDER = Symbol('EXCHANGE_RATE_PROVIDER');

export interface ExchangeRateQuery {
  householdId: string;
  /** Moneda a la que se convierte (la base del household). */
  base: Currency;
  /** Moneda desde la que se convierte (la del movimiento). */
  quote: Currency;
  /** Fecha del movimiento — nunca "hoy" (RN-37). */
  date: CalendarDate;
}

export interface ExchangeRateProvider {
  findEffectiveRate(query: ExchangeRateQuery): Promise<ExchangeRate | null>;
}
