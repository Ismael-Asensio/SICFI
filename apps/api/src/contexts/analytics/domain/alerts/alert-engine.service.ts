/**
 * `AlertEngine` — RN-33, RN-34, RN-35.
 *
 * Recorre las reglas, descarta las desactivadas por el usuario y las que RN-35
 * silencia, y ordena el resultado por gravedad.
 *
 * El motor **no conoce ninguna regla concreta**: recibe el array. Añadir A13 es
 * escribir una clase y meterla en `ALERT_RULES`, sin tocar este archivo.
 */
import { ALERT_LEVEL_RANK, type Alert, type AlertContext, type AlertRule } from './alert';
import { ALERT_RULES, ALL_CLEAR_RULE } from './rules';

export class AlertEngine {
  constructor(private readonly rules: readonly AlertRule[] = ALERT_RULES) {}

  /**
   * @param disabledCodes `BudgetSettings.disabledAlerts`, p. ej. `['A07','A10']`.
   */
  evaluate(context: AlertContext, disabledCodes: readonly string[] = []): Alert[] {
    const disabled = new Set(disabledCodes);

    // RN-35: antes de la fecha de inicio del control, las reglas que dependen de
    // fechas producirían avisos sobre un periodo que el usuario nunca gestionó.
    const beforeControlWindow = context.today.isBefore(context.controlStartDate);

    const alerts = this.rules
      .filter((rule) => !disabled.has(rule.code))
      .filter((rule) => !(rule.dateDependent && beforeControlWindow))
      .map((rule) => rule.evaluate(context))
      .filter((alert): alert is Alert => alert !== null);

    // RN-34: ordenadas por gravedad; a igual nivel, por código, para que el
    // Panel no baile entre recargas.
    alerts.sort((a, b) => {
      const byLevel = ALERT_LEVEL_RANK[b.level] - ALERT_LEVEL_RANK[a.level];
      return byLevel !== 0 ? byLevel : a.code.localeCompare(b.code);
    });

    // A12 solo aparece si no hay nada que decir.
    if (alerts.length === 0 && !disabled.has(ALL_CLEAR_RULE.code)) {
      const allClear = ALL_CLEAR_RULE.evaluate(context);
      if (allClear) return [allClear];
    }

    return alerts;
  }

  /** La más grave, que es la que el Panel destaca en la cabecera. */
  mostSevere(context: AlertContext, disabledCodes: readonly string[] = []): Alert | null {
    return this.evaluate(context, disabledCodes)[0] ?? null;
  }
}
