/**
 * `PeriodCalculator` — RN-06 a RN-12b. El corazón del producto.
 *
 * ⚠️ **Aquí es donde D3 se aparta del Excel.** En la hoja, apartar C$ 1 500 de
 * ahorro subía el "% ejecutado" y parecía gasto. Aquí no: el ahorro es un
 * traslado a un fondo que sigue siendo del usuario, así que existen DOS métricas
 * y no una:
 *
 *   · `gastoReal`     = fijos + variables          → mide gasto de verdad
 *   · `salidasDeCaja` = gastoReal + ahorro         → mide lo que salió del bolsillo
 *
 * El `%ejecutado` usa `gastoReal`, y es el que dispara la alerta A03: apartar
 * ahorro no debe generar un aviso de sobregasto. El `disponibleRestante` sí baja
 * con el ahorro, porque el dinero efectivamente salió de la quincena.
 *
 * Todos los importes de entrada deben venir ya en la moneda base del household
 * (`baseAmount`, RN-36). Sumar `amount` sin convertir es el bug clásico.
 */
import type { Currency } from '../../../shared/domain/currency.vo';
import { Money } from '../../../shared/domain/money.vo';
import { Percentage } from '../../../shared/domain/percentage.vo';

/** Sumas por tipo de movimiento dentro de la quincena, todas en moneda base. */
export interface PeriodMovementTotals {
  /** Σ INGRESO_EXTRA — suma al disponible (RN-06). */
  extraIncome: Money;
  /** Σ RETIRO_AHORRO — vuelve a caja, suma al disponible (RN-06). */
  savingsWithdrawn: Money;
  /** Σ FIJO — gasto real (RN-08). */
  fixedPaid: Money;
  /** Σ VARIABLE — gasto real (RN-08). */
  variable: Money;
  /** Σ AHORRO — NO es gasto; es traslado a fondo (D3, RN-08). */
  savingsSetAside: Money;
}

export interface PeriodCalculationInput {
  /** `null` cuando el usuario aún no planificó la quincena (dispara A01). */
  plannedIncome: Money | null;
  /** RN-07: Σ de los fijos activos que aplican a esta quincena. */
  budgetedFixed: Money;
  totals: PeriodMovementTotals;
  /** Moneda base del household: la de todo el resultado. */
  currency: Currency;
}

/** Resultado del cálculo. Todo son valores; no hay identidad ni estado mutable. */
export interface PeriodSnapshot {
  readonly currency: Currency;

  /** RN-06 */
  readonly available: Money;
  /** RN-07 */
  readonly budgetedFixed: Money;
  readonly fixedPaid: Money;
  readonly variable: Money;
  readonly savingsSetAside: Money;
  readonly extraIncome: Money;
  readonly savingsWithdrawn: Money;

  /** RN-08 — fijos + variables. El ahorro NO entra. */
  readonly realSpend: Money;
  /** RN-08b — lo que efectivamente salió del disponible. */
  readonly cashOutflow: Money;
  /** RN-09 — `max(0, presupuestados − pagados)`. */
  readonly pendingFixed: Money;
  /** RN-10 */
  readonly remainingAvailable: Money;
  /** RN-11 — **la métrica que manda**. */
  readonly projectedRemaining: Money;

  /** RN-12 — `gastoReal / disponible`. El que usa el umbral de A03. */
  readonly executedRatio: Percentage;
  /** RN-12b — `salidasDeCaja / disponible`. Métrica secundaria. */
  readonly committedRatio: Percentage;
}

export class PeriodCalculator {
  /**
   * Calcula el snapshot de una quincena.
   *
   * No devuelve `Result`: con importes ya validados y homogéneos en moneda, el
   * cálculo no puede fallar. Una moneda distinta sería un bug, y `Money` lo
   * detiene lanzando en vez de sumar a ciegas.
   */
  static calculate(input: PeriodCalculationInput): PeriodSnapshot {
    const { currency, totals, budgetedFixed } = input;
    const zero = Money.zero(currency);
    const plannedIncome = input.plannedIncome ?? zero;

    // RN-06 — el retiro de ahorro vuelve a caja y por tanto suma al disponible.
    const available = plannedIncome.plus(totals.extraIncome).plus(totals.savingsWithdrawn);

    // RN-08 — el ahorro NO es gasto (D3).
    const realSpend = totals.fixedPaid.plus(totals.variable);

    // RN-08b — pero sí sale del bolsillo.
    const cashOutflow = realSpend.plus(totals.savingsSetAside);

    // RN-09 — nunca negativo: pagar de más no genera "fijos pendientes negativos".
    const pendingFixed = budgetedFixed.minus(totals.fixedPaid).clampToZero();

    // RN-10 y RN-11
    const remainingAvailable = available.minus(cashOutflow);
    const projectedRemaining = remainingAvailable.minus(pendingFixed);

    // RN-12 y RN-12b — `ratioTo` ya devuelve 0 si el divisor es 0.
    const executedRatio = Percentage.unsafe(realSpend.ratioTo(available));
    const committedRatio = Percentage.unsafe(cashOutflow.ratioTo(available));

    return Object.freeze({
      currency,
      available,
      budgetedFixed,
      fixedPaid: totals.fixedPaid,
      variable: totals.variable,
      savingsSetAside: totals.savingsSetAside,
      extraIncome: totals.extraIncome,
      savingsWithdrawn: totals.savingsWithdrawn,
      realSpend,
      cashOutflow,
      pendingFixed,
      remainingAvailable,
      projectedRemaining,
      executedRatio,
      committedRatio,
    });
  }

  /** Totales en cero, para una quincena sin ningún movimiento. */
  static emptyTotals(currency: Currency): PeriodMovementTotals {
    const zero = Money.zero(currency);
    return {
      extraIncome: zero,
      savingsWithdrawn: zero,
      fixedPaid: zero,
      variable: zero,
      savingsSetAside: zero,
    };
  }
}
