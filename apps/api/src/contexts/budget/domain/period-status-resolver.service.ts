/**
 * `PeriodStatusResolver` — RN-13 a RN-17.
 *
 * Cascada: **el primer match gana**. El orden no es arbitrario, codifica la
 * gravedad: un sobregiro consumado importa más que no llegar a los fijos, y eso
 * más que rozar el umbral.
 *
 * Se implementa como una lista de reglas en vez de una escalera de `if` para que
 * el orden sea un dato visible y comprobable, no algo enterrado en el flujo.
 */
import type { Percentage } from '../../../shared/domain/percentage.vo';

import type { PeriodSnapshot } from './period-calculator.service';

export type PeriodStatus =
  /** RN-13 — no hay ingreso planificado ni movimientos que aporten. */
  | 'SIN_INGRESO'
  /** RN-14 — salió más dinero del que había. */
  | 'SOBREGIRO'
  /** RN-15 — lo que queda no cubre los fijos que faltan por pagar. */
  | 'NO_ALCANZA_FIJOS'
  /** RN-16 — se alcanzó el umbral de gasto configurado. */
  | 'CERCA_DEL_LIMITE'
  /** RN-17 — todo en orden. */
  | 'EN_ORDEN';

interface StatusRule {
  readonly status: PeriodStatus;
  readonly rule: string;
  matches(snapshot: PeriodSnapshot, threshold: Percentage): boolean;
}

/** El orden ES la regla de negocio (RN-13 → RN-17). No reordenar sin cambiar el catálogo. */
const CASCADE: readonly StatusRule[] = [
  {
    status: 'SIN_INGRESO',
    rule: 'RN-13',
    matches: (snapshot) => snapshot.available.isZero(),
  },
  {
    status: 'SOBREGIRO',
    rule: 'RN-14',
    // Ojo: usa salidasDeCaja, no gastoReal. Apartar ahorro sí puede sobregirar.
    matches: (snapshot) => snapshot.cashOutflow.isGreaterThan(snapshot.available),
  },
  {
    status: 'NO_ALCANZA_FIJOS',
    rule: 'RN-15',
    matches: (snapshot) => snapshot.projectedRemaining.isNegative(),
  },
  {
    status: 'CERCA_DEL_LIMITE',
    rule: 'RN-16',
    // Usa %ejecutado (gasto real): apartar ahorro no debe disparar este estado.
    matches: (snapshot, threshold) => snapshot.executedRatio.isAtLeast(threshold),
  },
];

export class PeriodStatusResolver {
  /**
   * @param threshold `BudgetSettings.spendThreshold`, como fracción (0,80 = 80 %).
   */
  static resolve(snapshot: PeriodSnapshot, threshold: Percentage): PeriodStatus {
    for (const rule of CASCADE) {
      if (rule.matches(snapshot, threshold)) return rule.status;
    }
    return 'EN_ORDEN';
  }

  /** Igual que `resolve`, pero además dice qué RN decidió. Útil para depurar. */
  static explain(
    snapshot: PeriodSnapshot,
    threshold: Percentage
  ): { status: PeriodStatus; rule: string } {
    for (const rule of CASCADE) {
      if (rule.matches(snapshot, threshold)) return { status: rule.status, rule: rule.rule };
    }
    return { status: 'EN_ORDEN', rule: 'RN-17' };
  }
}
