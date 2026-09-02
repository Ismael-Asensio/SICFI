/**
 * Alertas del Panel. RN-33, RN-34.
 *
 * `AlertLevel` está ordenado por gravedad: el Panel las ordena con este criterio.
 */
import type { CalendarDate } from '../../../../shared/domain/calendar-date.vo';
import type { Currency } from '../../../../shared/domain/currency.vo';
import type { Money } from '../../../../shared/domain/money.vo';
import type { Percentage } from '../../../../shared/domain/percentage.vo';
import type { PeriodSnapshot } from '../../../budget/domain/period-calculator.service';

export type AlertLevel = 'URGENTE' | 'AVISO' | 'INFO' | 'OK';

/** Mayor número = más grave. Se usa para ordenar (RN-34). */
export const ALERT_LEVEL_RANK: Readonly<Record<AlertLevel, number>> = {
  URGENTE: 4,
  AVISO: 3,
  INFO: 2,
  OK: 1,
};

export interface AlertAction {
  readonly label: string;
  readonly href: string;
}

export interface Alert {
  /** 'A01'..'A12' */
  readonly code: string;
  readonly level: AlertLevel;
  readonly title: string;
  readonly message: string;
  readonly action?: AlertAction;
}

/**
 * Todo lo que las reglas necesitan para decidir. Se construye una vez por
 * evaluación, con datos ya agregados: las reglas no consultan nada.
 */
export interface AlertContext {
  readonly snapshot: PeriodSnapshot;
  readonly currency: Currency;

  /** `BudgetSettings.spendThreshold`. */
  readonly spendThreshold: Percentage;
  /** `BudgetSettings.dueSoonDays`. */
  readonly dueSoonDays: number;
  /** `BudgetSettings.inactivityDays`. */
  readonly inactivityDays: number;
  /** `BudgetSettings.savingGoalPerPeriod`. Cero = sin meta. */
  readonly savingGoal: Money;

  /** Hoy, en la zona horaria del household. */
  readonly today: CalendarDate;
  /** RN-35: ninguna regla con dependencia de fechas se evalúa antes de esta. */
  readonly controlStartDate: CalendarDate;

  /** Días que faltan para que cierre la quincena activa. */
  readonly daysUntilPeriodClose: number;
  /** Fecha del último movimiento registrado, o `null` si no hay ninguno. */
  readonly lastMovementDate: CalendarDate | null;

  /** Fijos vencidos y sin registrar en la quincena activa (A05). */
  readonly overdueFixedCount: number;
  /** Fijos que vencen dentro de `dueSoonDays` (A06). */
  readonly dueSoonFixedCount: number;
  /** Movimientos en estado PENDIENTE en la quincena activa (A08). */
  readonly pendingTransactionCount: number;
  /** Fijos de quincenas ya cerradas que nunca se registraron (A09). */
  readonly forgottenFixedCount: number;
  /** Movimientos con datos incompletos (A10). */
  readonly incompleteTransactionCount: number;
}

/**
 * Strategy. Añadir una alerta = añadir una clase que implemente esto y
 * registrarla en el array. **El motor no se toca.**
 */
export interface AlertRule {
  readonly code: string;
  readonly level: AlertLevel;
  /**
   * `true` si la regla depende de fechas y por tanto no debe evaluarse antes de
   * `controlStartDate` (RN-35).
   */
  readonly dateDependent: boolean;
  evaluate(context: AlertContext): Alert | null;
}

/** Formatea un importe para los mensajes: `C$ 1 234,56`. */
export function formatMoney(amount: Money): string {
  const symbol = amount.currency.code === 'NIO' ? 'C$' : amount.currency.code;
  return `${symbol} ${amount.abs().toFixed()}`;
}

export function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}
