/**
 * Las 12 reglas de alerta (A01..A12). RN-33, RN-34, RN-35.
 *
 * Cada una es una clase independiente que implementa `AlertRule`. Añadir una
 * alerta nueva es añadir una clase y meterla en `ALERT_RULES`: el motor no se
 * toca (Open/Closed).
 *
 * Las marcadas `dateDependent` no se evalúan antes de `controlStartDate` — sin
 * eso, un usuario que empieza en junio recibe decenas de falsos "olvidaste
 * pagar" de enero a mayo (RN-35).
 */
import { Money } from '../../../../shared/domain/money.vo';

import {
  formatMoney,
  plural,
  type Alert,
  type AlertContext,
  type AlertLevel,
  type AlertRule,
} from './alert';

/** A01 — no hay ingreso planificado. Corrige P12: el Excel lo precargaba. */
export class NoIncomeRule implements AlertRule {
  readonly code = 'A01';
  readonly level: AlertLevel = 'URGENTE';
  readonly dateDependent = false;

  evaluate({ snapshot }: AlertContext): Alert | null {
    if (!snapshot.available.isZero()) return null;

    return {
      code: this.code,
      level: this.level,
      title: 'Falta el ingreso de la quincena',
      message:
        'No has puesto el ingreso de esta quincena. Sin él no se puede calcular ' +
        'cuánto te queda ni avisarte si te pasas.',
      action: { label: 'Planificar quincena', href: '/quincenas' },
    };
  }
}

/** A02 — sobregiro consumado. Usa salidasDeCaja: el ahorro también sale. */
export class OverdraftRule implements AlertRule {
  readonly code = 'A02';
  readonly level: AlertLevel = 'URGENTE';
  readonly dateDependent = false;

  evaluate({ snapshot }: AlertContext): Alert | null {
    if (snapshot.available.isZero()) return null;
    if (!snapshot.cashOutflow.isGreaterThan(snapshot.available)) return null;

    const over = snapshot.cashOutflow.minus(snapshot.available);
    return {
      code: this.code,
      level: this.level,
      title: 'Te pasaste del disponible',
      message:
        `Te pasaste por ${formatMoney(over)}. Frena los gastos variables o ` +
        'ajusta lo que apartaste para ahorro.',
      action: { label: 'Ver movimientos', href: '/movimientos' },
    };
  }
}

/**
 * A03 — se alcanzó el umbral de gasto.
 *
 * Usa `%ejecutado` (gasto real), no `%comprometido`: apartar ahorro no debe
 * disparar un aviso de sobregasto (RN-12, D3).
 */
export class SpendThresholdRule implements AlertRule {
  readonly code = 'A03';
  readonly level: AlertLevel = 'AVISO';
  readonly dateDependent = false;

  evaluate({ snapshot, spendThreshold, daysUntilPeriodClose }: AlertContext): Alert | null {
    if (snapshot.available.isZero()) return null;
    if (!snapshot.realSpend.isPositive()) return null;
    // Si ya hay sobregiro manda A02; esta alerta es para el tramo previo.
    if (snapshot.cashOutflow.isGreaterThan(snapshot.available)) return null;
    if (!snapshot.executedRatio.isAtLeast(spendThreshold)) return null;

    const days = Math.max(0, daysUntilPeriodClose);
    return {
      code: this.code,
      level: this.level,
      title: 'Vas cerca del límite',
      message:
        `Ya usaste el ${snapshot.executedRatio.toPercentString()} % de tu disponible ` +
        `y ${plural(days, 'queda 1 día', `quedan ${days} días`)} para que cierre la quincena.`,
      action: { label: 'Ver movimientos', href: '/movimientos' },
    };
  }
}

/** A04 — lo que queda no cubre los fijos pendientes. La métrica que manda. */
export class InsufficientForFixedRule implements AlertRule {
  readonly code = 'A04';
  readonly level: AlertLevel = 'URGENTE';
  readonly dateDependent = false;

  evaluate({ snapshot }: AlertContext): Alert | null {
    if (!snapshot.projectedRemaining.isNegative()) return null;

    const missing = snapshot.projectedRemaining.abs();
    return {
      code: this.code,
      level: this.level,
      title: 'No alcanza para los fijos pendientes',
      message:
        `Te faltan ${formatMoney(missing)} para cubrir los fijos que aún no has pagado ` +
        `(${formatMoney(snapshot.pendingFixed)}).`,
      action: { label: 'Ver fijos', href: '/fijos' },
    };
  }
}

/** A05 — fijos vencidos sin registrar en la quincena activa. */
export class OverdueFixedRule implements AlertRule {
  readonly code = 'A05';
  readonly level: AlertLevel = 'URGENTE';
  readonly dateDependent = true;

  evaluate({ overdueFixedCount }: AlertContext): Alert | null {
    if (overdueFixedCount <= 0) return null;

    return {
      code: this.code,
      level: this.level,
      title: 'Tienes pagos fijos vencidos',
      message:
        `${overdueFixedCount} ${plural(overdueFixedCount, 'pago fijo venció', 'pagos fijos vencieron')} ` +
        'y no lo has registrado. Si ya lo pagaste, anótalo.',
      action: { label: 'Conciliar fijos', href: '/fijos/control' },
    };
  }
}

/** A06 — fijos que vencen dentro de los días de aviso. */
export class DueSoonFixedRule implements AlertRule {
  readonly code = 'A06';
  readonly level: AlertLevel = 'AVISO';
  readonly dateDependent = true;

  evaluate({ dueSoonFixedCount, dueSoonDays }: AlertContext): Alert | null {
    if (dueSoonFixedCount <= 0) return null;

    return {
      code: this.code,
      level: this.level,
      title: 'Pagos fijos por vencer',
      message:
        `${dueSoonFixedCount} ${plural(dueSoonFixedCount, 'pago vence', 'pagos vencen')} ` +
        `en los próximos ${dueSoonDays} días.`,
      action: { label: 'Conciliar fijos', href: '/fijos/control' },
    };
  }
}

/** A07 — inactividad: hace días que no se registra nada. */
export class InactivityRule implements AlertRule {
  readonly code = 'A07';
  readonly level: AlertLevel = 'AVISO';
  readonly dateDependent = true;

  evaluate({ lastMovementDate, today, inactivityDays }: AlertContext): Alert | null {
    if (!lastMovementDate) {
      return {
        code: this.code,
        level: this.level,
        title: 'Aún no registras movimientos',
        message: 'No has registrado ningún movimiento todavía. El control empieza por anotarlos.',
        action: { label: 'Registrar movimiento', href: '/movimientos/nuevo' },
      };
    }

    const days = lastMovementDate.daysUntil(today);
    if (days <= inactivityDays) return null;

    return {
      code: this.code,
      level: this.level,
      title: 'Llevas días sin registrar',
      message: `Hace ${days} días que no registras un movimiento. Es fácil perder el hilo del gasto.`,
      action: { label: 'Registrar movimiento', href: '/movimientos/nuevo' },
    };
  }
}

/** A08 — movimientos marcados como PENDIENTE (RN-27: sí cuentan en el gasto). */
export class PendingTransactionsRule implements AlertRule {
  readonly code = 'A08';
  readonly level: AlertLevel = 'AVISO';
  readonly dateDependent = false;

  evaluate({ pendingTransactionCount }: AlertContext): Alert | null {
    if (pendingTransactionCount <= 0) return null;

    return {
      code: this.code,
      level: this.level,
      title: 'Movimientos pendientes de pago',
      message:
        `${pendingTransactionCount} ${plural(pendingTransactionCount, 'movimiento está marcado', 'movimientos están marcados')} ` +
        'como Pendiente. Ya cuentan en el gasto de la quincena.',
      action: { label: 'Ver pendientes', href: '/movimientos?estado=PENDIENTE' },
    };
  }
}

/** A09 — fijos de quincenas cerradas que nunca se registraron (RN-24). */
export class ForgottenFixedRule implements AlertRule {
  readonly code = 'A09';
  readonly level: AlertLevel = 'AVISO';
  readonly dateDependent = true;

  evaluate({ forgottenFixedCount }: AlertContext): Alert | null {
    if (forgottenFixedCount <= 0) return null;

    return {
      code: this.code,
      level: this.level,
      title: 'Fijos de quincenas cerradas sin registrar',
      message:
        `${forgottenFixedCount} ${plural(forgottenFixedCount, 'fijo de una quincena ya cerrada nunca se registró', 'fijos de quincenas ya cerradas nunca se registraron')}. ` +
        'Tus totales del año están incompletos.',
      action: { label: 'Ver historial', href: '/historial' },
    };
  }
}

/** A10 — movimientos con datos incompletos (columna L del Registro). */
export class IncompleteDataRule implements AlertRule {
  readonly code = 'A10';
  readonly level: AlertLevel = 'AVISO';
  readonly dateDependent = false;

  evaluate({ incompleteTransactionCount }: AlertContext): Alert | null {
    if (incompleteTransactionCount <= 0) return null;

    return {
      code: this.code,
      level: this.level,
      title: 'Movimientos con datos incompletos',
      message:
        `${incompleteTransactionCount} ${plural(incompleteTransactionCount, 'movimiento tiene', 'movimientos tienen')} ` +
        'datos incompletos y no se están contando bien.',
      action: { label: 'Revisar movimientos', href: '/movimientos' },
    };
  }
}

/**
 * A11 — meta de ahorro.
 *
 * Compara contra el ahorro **efectivo** (aportes − retiros), no el bruto:
 * apartar C$ 1 500 y retirar C$ 1 400 no cumple una meta de C$ 1 500 (RN-41b).
 */
export class SavingGoalRule implements AlertRule {
  readonly code = 'A11';
  readonly level: AlertLevel = 'INFO';
  readonly dateDependent = false;

  evaluate({ snapshot, savingGoal }: AlertContext): Alert | null {
    if (!savingGoal.isPositive()) return null;

    const effective = snapshot.savingsSetAside.minus(snapshot.savingsWithdrawn);

    if (effective.isGreaterThanOrEqual(savingGoal)) {
      return {
        code: this.code,
        level: 'OK',
        title: 'Meta de ahorro cumplida',
        message: `Apartaste ${formatMoney(effective)} de una meta de ${formatMoney(savingGoal)}.`,
      };
    }

    const missing = savingGoal.minus(effective);
    return {
      code: this.code,
      level: this.level,
      title: 'Meta de ahorro pendiente',
      message: `Te faltan ${formatMoney(missing)} para cumplir tu meta de ahorro de la quincena.`,
      action: { label: 'Apartar ahorro', href: '/movimientos/nuevo?tipo=AHORRO' },
    };
  }
}

/**
 * A12 — todo en orden.
 *
 * No se evalúa como las demás: el motor la añade solo si ninguna otra produjo
 * nada. Se declara aquí para que las 12 vivan en el mismo sitio.
 */
export class AllClearRule implements AlertRule {
  readonly code = 'A12';
  readonly level: AlertLevel = 'OK';
  readonly dateDependent = false;

  evaluate({ snapshot }: AlertContext): Alert | null {
    return {
      code: this.code,
      level: this.level,
      title: 'Todo en orden',
      message: `Vas bien: te quedan ${formatMoney(snapshot.projectedRemaining)} después de cubrir los fijos pendientes.`,
    };
  }
}

/**
 * Las 11 reglas que el motor evalúa. A12 se aplica aparte como fallback.
 * El orden aquí no importa: el motor ordena por nivel (RN-34).
 */
export const ALERT_RULES: readonly AlertRule[] = [
  new NoIncomeRule(),
  new OverdraftRule(),
  new SpendThresholdRule(),
  new InsufficientForFixedRule(),
  new OverdueFixedRule(),
  new DueSoonFixedRule(),
  new InactivityRule(),
  new PendingTransactionsRule(),
  new ForgottenFixedRule(),
  new IncompleteDataRule(),
  new SavingGoalRule(),
];

export const ALL_CLEAR_RULE = new AllClearRule();

/** Meta de ahorro en cero, para construir contextos en tests. */
export const noSavingGoal = (currency: Money['currency']): Money => Money.zero(currency);
