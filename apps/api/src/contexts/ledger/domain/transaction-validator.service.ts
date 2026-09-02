/**
 * `TransactionValidator` — RN-25 a RN-29, más RN-39 y RN-41.
 *
 * Chain of Responsibility: una lista ordenada de reglas; **la primera que falla
 * gana**. Reproduce la cascada de validación de la columna L del `Registro`
 * (§1.6 del plan), corrigiendo el problema P1: el vínculo con un fijo es una FK,
 * no una coincidencia de texto que un typo rompe en silencio.
 *
 * Es síncrono y puro a propósito: las búsquedas (¿existe el fijo?, ¿cuánto hay
 * en el fondo?) las resuelve el caso de uso y las pasa ya hechas. Así el dominio
 * se prueba sin base de datos, que es el DoD de esta fase.
 */
import type { CalendarDate } from '../../../shared/domain/calendar-date.vo';
import { BusinessRuleError, ValidationError, type DomainError } from '../../../shared/domain/domain-error';
import type { Money } from '../../../shared/domain/money.vo';
import { err, ok, type Result } from '../../../shared/domain/result';

import { MovementTypes, type MovementType, type TxStatus } from './movement-type';

/** Lo que el usuario captura. `periodId` y `baseAmount` NO están: son derivados. */
export interface TransactionDraft {
  date: CalendarDate;
  type: MovementType;
  categoryId: string;
  concept: string;
  amount: Money;
  status: TxStatus;
  recurringExpenseId: string | null;
  savingsFundId: string | null;
}

/** Hechos ya resueltos por el caso de uso. El dominio no consulta nada. */
export interface ValidationContext {
  /** Año del presupuesto activo. */
  budgetYear: number;
  /** Quincena que contiene `date`, o `null` si la fecha cae fuera (RN-03, RN-29). */
  resolvedPeriodId: string | null;
  /** ¿Existe el fijo referenciado y pertenece al household? (RN-26) */
  recurringExpenseExists: boolean;
  /** ¿Existe el fondo referenciado y pertenece al household? (RN-39) */
  savingsFundExists: boolean;
  /** Saldo actual del fondo, para RN-41. `null` si no aplica. */
  savingsFundBalance: Money | null;
  savingsFundName: string | null;
}

interface ValidationRule {
  readonly rule: string;
  check(draft: TransactionDraft, context: ValidationContext): DomainError | null;
}

/** El orden ES la cascada. El primer fallo gana. */
const RULES: readonly ValidationRule[] = [
  {
    // RN-28 — el signo lo lleva el tipo, nunca el importe.
    rule: 'RN-28',
    check: (draft) =>
      draft.amount.isPositive()
        ? null
        : new ValidationError(
            'El importe debe ser mayor que cero. La dirección la determina el tipo de movimiento',
            { amount: draft.amount.toFixed() }
          ),
  },
  {
    rule: 'RN-25',
    check: (draft) =>
      draft.concept.trim().length > 0
        ? null
        : new ValidationError('Falta el concepto del movimiento'),
  },
  {
    rule: 'RN-25',
    check: (draft) =>
      draft.categoryId.trim().length > 0 ? null : new ValidationError('Falta la categoría'),
  },
  {
    // RN-03, RN-29 — sin quincena no hay dónde imputar el movimiento.
    rule: 'RN-29',
    check: (draft, context) =>
      context.resolvedPeriodId
        ? null
        : new BusinessRuleError(
            'RN-29',
            `La fecha ${draft.date.toISO()} está fuera del año configurado (${context.budgetYear})`,
            { date: draft.date.toISO(), budgetYear: context.budgetYear }
          ),
  },
  {
    // RN-26 — FK, no coincidencia de texto. Corrige P1.
    rule: 'RN-26',
    check: (draft, context) => {
      if (!MovementTypes.requiresRecurringExpense(draft.type)) return null;

      if (!draft.recurringExpenseId) {
        return new BusinessRuleError(
          'RN-26',
          'Un movimiento de tipo FIJO debe indicar a qué gasto fijo corresponde',
          { type: draft.type }
        );
      }
      if (!context.recurringExpenseExists) {
        return new BusinessRuleError(
          'RN-26',
          'El gasto fijo referenciado no existe en este household',
          { recurringExpenseId: draft.recurringExpenseId }
        );
      }
      return null;
    },
  },
  {
    // Simétrica de la anterior: no ensuciar la FK desde otros tipos.
    rule: 'RN-26',
    check: (draft) =>
      !MovementTypes.requiresRecurringExpense(draft.type) && draft.recurringExpenseId
        ? new BusinessRuleError(
            'RN-26',
            `Un movimiento de tipo ${draft.type} no puede referenciar un gasto fijo`,
            { type: draft.type }
          )
        : null,
  },
  {
    // RN-39 — sin fondo, el saldo de ahorro es incalculable.
    rule: 'RN-39',
    check: (draft, context) => {
      if (!MovementTypes.requiresSavingsFund(draft.type)) return null;

      if (!draft.savingsFundId) {
        return new BusinessRuleError(
          'RN-39',
          `Un movimiento de tipo ${draft.type} debe indicar el fondo de ahorro`,
          { type: draft.type }
        );
      }
      if (!context.savingsFundExists) {
        return new BusinessRuleError(
          'RN-39',
          'El fondo de ahorro referenciado no existe en este household',
          { savingsFundId: draft.savingsFundId }
        );
      }
      return null;
    },
  },
  {
    rule: 'RN-39',
    check: (draft) =>
      !MovementTypes.requiresSavingsFund(draft.type) && draft.savingsFundId
        ? new BusinessRuleError(
            'RN-39',
            `Un movimiento de tipo ${draft.type} no puede referenciar un fondo de ahorro`,
            { type: draft.type }
          )
        : null,
  },
  {
    // RN-41 — un fondo de ahorro no es una línea de crédito.
    rule: 'RN-41',
    check: (draft, context) => {
      if (draft.type !== 'RETIRO_AHORRO') return null;
      if (!context.savingsFundBalance) return null;

      const balance = context.savingsFundBalance;
      if (!draft.amount.currency.equals(balance.currency)) {
        return new BusinessRuleError(
          'RN-41',
          `El retiro está en ${draft.amount.currency.code} pero el fondo lleva ` +
            `${balance.currency.code}. Retira en la moneda del fondo.`,
          { withdrawal: draft.amount.currency.code, fund: balance.currency.code }
        );
      }
      if (draft.amount.isGreaterThan(balance)) {
        return new BusinessRuleError(
          'RN-41',
          `No puedes retirar ${draft.amount.toFixed()} del fondo ` +
            `"${context.savingsFundName ?? 'de ahorro'}": solo tiene ${balance.toFixed()}`,
          { requested: draft.amount.toFixed(), available: balance.toFixed() }
        );
      }
      return null;
    },
  },
];

export interface ValidatedTransaction {
  readonly draft: TransactionDraft;
  readonly periodId: string;
  /**
   * RN-27 — los PENDIENTE **sí** cuentan en el gasto de la quincena, igual que
   * en el Excel, pero disparan la alerta A08. No son un borrador ignorable.
   */
  readonly countsTowardSpending: boolean;
  readonly isRealSpend: boolean;
}

export class TransactionValidator {
  static validate(
    draft: TransactionDraft,
    context: ValidationContext
  ): Result<ValidatedTransaction, DomainError> {
    for (const rule of RULES) {
      const failure = rule.check(draft, context);
      if (failure) return err(failure);
    }

    // Garantizado por la regla RN-29, pero TypeScript no lo sabe.
    const periodId = context.resolvedPeriodId as string;

    return ok({
      draft,
      periodId,
      // RN-27: PAGADO y PENDIENTE cuentan; PROGRAMADO es una previsión futura.
      countsTowardSpending: draft.status !== 'PROGRAMADO',
      isRealSpend: MovementTypes.isRealSpend(draft.type),
    });
  }

  /**
   * Todos los fallos de una vez, no solo el primero.
   * Un formulario debe poder marcar los cinco campos malos a la vez.
   */
  static collectFailures(
    draft: TransactionDraft,
    context: ValidationContext
  ): readonly DomainError[] {
    return RULES.map((rule) => rule.check(draft, context)).filter(
      (failure): failure is DomainError => failure !== null
    );
  }
}
