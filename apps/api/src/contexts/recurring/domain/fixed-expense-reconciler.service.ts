/**
 * `FixedExpenseReconciler` — RN-22, RN-23, RN-24.
 *
 * Responde, para cada par (fijo × quincena), en qué estado está el pago. Es lo
 * que alimenta la hoja `Control` y las alertas A05, A06 y A09.
 *
 * Igual que el estado de la quincena, es una **cascada donde el primer match
 * gana**, y el orden codifica la prioridad: haber pagado importa más que estar
 * vencido, porque un fijo pagado tarde ya no es una deuda.
 */
import type { CalendarDate } from '../../../shared/domain/calendar-date.vo';
import { Money } from '../../../shared/domain/money.vo';

import type { PeriodRef, RecurringExpense } from './recurring-expense.entity';

export type FixedExpenseStatus =
  /** El fijo no aplica a esta quincena (inactivo, otra mitad, fuera de vigencia). */
  | 'NO_APLICA'
  /** Registrado y el importe coincide dentro de la tolerancia. */
  | 'PAGADO'
  /** Registrado pero por un importe distinto del presupuestado. */
  | 'PAGADO_MONTO_DISTINTO'
  /** No registrado y la fecha límite ya pasó. */
  | 'VENCIDO'
  /** No registrado y vence dentro de los días de aviso. */
  | 'POR_VENCER'
  /** No registrado, aún con margen. */
  | 'PENDIENTE';

export interface ReconciliationInput {
  expense: RecurringExpense;
  period: PeriodRef;
  /** Σ de los movimientos FIJO asociados a este fijo en esta quincena, en moneda base. */
  registered: Money;
  /** Importe presupuestado para esta quincena, en moneda base. */
  budgeted: Money;
  today: CalendarDate;
  /** `BudgetSettings.paidToleranceAmount` — RN-23, por defecto C$ 1,00. */
  tolerance: Money;
  /** `BudgetSettings.dueSoonDays` — RN-22. */
  dueSoonDays: number;
}

export interface ReconciliationResult {
  readonly status: FixedExpenseStatus;
  readonly dueDate: CalendarDate | null;
  readonly registered: Money;
  readonly budgeted: Money;
  /** `registrado − presupuestado`. Positivo si se pagó de más. */
  readonly difference: Money;
  readonly daysUntilDue: number | null;
}

export class FixedExpenseReconciler {
  /** RN-22: cascada de estados. */
  static reconcile(input: ReconciliationInput): ReconciliationResult {
    const { expense, period, registered, budgeted, today, tolerance, dueSoonDays } = input;

    // NO_APLICA se decide por el presupuesto, no por `appliesToPeriod`: un fijo
    // que no aplica tiene presupuesto 0, y así el criterio es uno solo.
    if (budgeted.isZero() && !expense.appliesToPeriod(period)) {
      return {
        status: 'NO_APLICA',
        dueDate: null,
        registered,
        budgeted,
        difference: Money.zero(budgeted.currency),
        daysUntilDue: null,
      };
    }

    const dueDate = expense.dueDateIn(period);
    const daysUntilDue = today.daysUntil(dueDate);
    const difference = registered.minus(budgeted);

    const status = FixedExpenseReconciler.resolveStatus({
      registered,
      difference,
      tolerance,
      daysUntilDue,
      dueSoonDays,
    });

    return { status, dueDate, registered, budgeted, difference, daysUntilDue };
  }

  private static resolveStatus(params: {
    registered: Money;
    difference: Money;
    tolerance: Money;
    daysUntilDue: number;
    dueSoonDays: number;
  }): FixedExpenseStatus {
    const { registered, difference, tolerance, daysUntilDue, dueSoonDays } = params;

    if (registered.isPositive()) {
      // RN-23: la tolerancia absorbe redondeos y propinas de un córdoba.
      // Se usa `<` estricto: con tolerancia 1,00 una diferencia de exactamente
      // 1,00 ya es un monto distinto.
      return difference.abs().isLessThan(tolerance) ? 'PAGADO' : 'PAGADO_MONTO_DISTINTO';
    }

    if (daysUntilDue < 0) return 'VENCIDO';
    if (daysUntilDue <= dueSoonDays) return 'POR_VENCER';
    return 'PENDIENTE';
  }

  /**
   * RN-24 — ¿es un fijo *olvidado*?
   *
   * Las cuatro condiciones son conjuntas:
   *   1. la quincena está cerrada (su fin ya pasó);
   *   2. su fin es posterior o igual a `controlStartDate` (RN-35);
   *   3. el fijo estaba activo y aplicaba a esa quincena;
   *   4. no hay ningún movimiento asociado.
   *
   * La condición 2 es la que evita inundar de falsos "olvidaste pagar" a un
   * usuario que empieza a usar la app a mitad de año.
   */
  static isForgotten(params: {
    expense: RecurringExpense;
    period: PeriodRef;
    registered: Money;
    today: CalendarDate;
    controlStartDate: CalendarDate;
  }): boolean {
    const { expense, period, registered, today, controlStartDate } = params;

    const periodIsClosed = period.endDate.isBefore(today);
    const withinControlWindow = period.endDate.isSameOrAfter(controlStartDate);

    return (
      periodIsClosed &&
      withinControlWindow &&
      expense.appliesToPeriod(period) &&
      !registered.isPositive()
    );
  }
}
