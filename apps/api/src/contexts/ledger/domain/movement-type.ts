/**
 * `MovementType` y su semántica. RN-25, y RN-08 por D3.
 *
 * Tres clasificaciones distintas que conviene no confundir:
 *
 *   · **dirección**  — ¿suma o resta del disponible de la quincena?
 *   · **gasto real** — ¿cuenta para el `%ejecutado`? Solo FIJO y VARIABLE.
 *   · **fondo**      — ¿exige un `savingsFundId`? Solo AHORRO y RETIRO_AHORRO.
 *
 * El ahorro resta del disponible pero **no es gasto**: es la distinción que el
 * Excel no hacía (P10) y la razón de que existan dos métricas en RN-08/RN-08b.
 */
export type MovementType = 'FIJO' | 'VARIABLE' | 'AHORRO' | 'RETIRO_AHORRO' | 'INGRESO_EXTRA';

export type TxStatus = 'PAGADO' | 'PENDIENTE' | 'PROGRAMADO';

/** Los que suman al disponible de la quincena (RN-06). */
const INFLOWS: ReadonlySet<MovementType> = new Set<MovementType>([
  'INGRESO_EXTRA',
  'RETIRO_AHORRO',
]);

/** Los que cuentan como gasto real y mueven el `%ejecutado` (RN-08, RN-12). */
const REAL_SPEND: ReadonlySet<MovementType> = new Set<MovementType>(['FIJO', 'VARIABLE']);

/** Los que obligan a referenciar un fondo (RN-39). */
const FUND_BOUND: ReadonlySet<MovementType> = new Set<MovementType>(['AHORRO', 'RETIRO_AHORRO']);

export const MovementTypes = {
  /** Suma al disponible. */
  isInflow(type: MovementType): boolean {
    return INFLOWS.has(type);
  },

  /** Sale del disponible: FIJO, VARIABLE y AHORRO. */
  isOutflow(type: MovementType): boolean {
    return !INFLOWS.has(type);
  },

  /** Cuenta como gasto real (RN-08). El ahorro NO. */
  isRealSpend(type: MovementType): boolean {
    return REAL_SPEND.has(type);
  },

  /** Exige `savingsFundId` (RN-39). */
  requiresSavingsFund(type: MovementType): boolean {
    return FUND_BOUND.has(type);
  },

  /** Exige `recurringExpenseId` (RN-26). */
  requiresRecurringExpense(type: MovementType): boolean {
    return type === 'FIJO';
  },
} as const;
