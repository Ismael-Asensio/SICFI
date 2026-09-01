/**
 * Datos maestros del seed — transcripción literal del Excel
 * `Presupuesto_Quincenal_2026.xlsx`, hojas `Listas` (§1.3) y `Fijos` (§1.5).
 *
 * No hay lógica aquí: solo las tablas. La lógica de inserción vive en `seed.ts`.
 */

export type CategoryKindSeed = 'FIJO' | 'VARIABLE' | 'AHORRO';

export interface CategorySeed {
  name: string;
  kind: CategoryKindSeed;
}

/** Hoja `Listas` — 24 categorías con su tipo sugerido. El orden es el del Excel. */
export const CATEGORIES: readonly CategorySeed[] = [
  { name: 'Vivienda', kind: 'FIJO' },
  { name: 'Servicios básicos', kind: 'FIJO' },
  { name: 'Internet y teléfono', kind: 'FIJO' },
  { name: 'Transporte', kind: 'FIJO' },
  { name: 'Combustible', kind: 'FIJO' },
  { name: 'Deudas y tarjetas', kind: 'FIJO' },
  { name: 'Suscripciones', kind: 'FIJO' },
  { name: 'Seguros', kind: 'FIJO' },
  { name: 'Alimentación', kind: 'VARIABLE' },
  { name: 'Supermercado', kind: 'VARIABLE' },
  { name: 'Salud', kind: 'VARIABLE' },
  { name: 'Educación', kind: 'VARIABLE' },
  { name: 'Cuidado personal', kind: 'VARIABLE' },
  { name: 'Ropa y calzado', kind: 'VARIABLE' },
  { name: 'Entretenimiento', kind: 'VARIABLE' },
  { name: 'Restaurantes', kind: 'VARIABLE' },
  { name: 'Hogar y mantenimiento', kind: 'VARIABLE' },
  { name: 'Mascotas', kind: 'VARIABLE' },
  { name: 'Regalos y celebraciones', kind: 'VARIABLE' },
  { name: 'Familia', kind: 'VARIABLE' },
  { name: 'Impuestos y trámites', kind: 'VARIABLE' },
  { name: 'Ahorro', kind: 'AHORRO' },
  { name: 'Imprevistos', kind: 'VARIABLE' },
  { name: 'Otros', kind: 'VARIABLE' },
] as const;

/** Hoja `Listas` — 7 métodos de pago. */
export const PAYMENT_METHODS: readonly string[] = [
  'Efectivo',
  'Tarjeta de débito',
  'Tarjeta de crédito',
  'Transferencia',
  'Billetera móvil',
  'Débito automático',
  'Otro',
] as const;

export interface RecurringExpenseSeed {
  code: string;
  categoryName: string;
  concept: string;
  amount: string;
  dueDay: number;
  frequency: 'QUINCENAL' | 'MENSUAL';
  paymentMethodName: string;
}

/**
 * Hoja `Fijos` — los 5 fijos activos precargados.
 *
 * `appliesTo` NO se declara aquí: es derivado (RN-18) y lo calcula el seed con la
 * misma función que usará el dominio. Declararlo a mano sería duplicar la regla.
 *
 * Total: C$ 12 100/mes contra C$ 8 500/quincena de ingreso → 71,2 % comprometido.
 */
export const RECURRING_EXPENSES: readonly RecurringExpenseSeed[] = [
  {
    code: 'F01',
    categoryName: 'Vivienda',
    concept: 'Apoyo Casa',
    amount: '2500.00',
    dueDay: 5,
    frequency: 'QUINCENAL',
    paymentMethodName: 'Transferencia',
  },
  {
    code: 'F02',
    categoryName: 'Transporte',
    concept: 'Pasajes y transporte',
    amount: '2400.00',
    dueDay: 1,
    frequency: 'QUINCENAL',
    paymentMethodName: 'Efectivo',
  },
  {
    code: 'F03',
    categoryName: 'Deudas y tarjetas',
    concept: 'Pago Perfume',
    amount: '400.00',
    dueDay: 18,
    frequency: 'QUINCENAL',
    paymentMethodName: 'Transferencia',
  },
  {
    code: 'F04',
    categoryName: 'Suscripciones',
    concept: 'Streaming',
    amount: '400.00',
    dueDay: 12,
    frequency: 'QUINCENAL',
    paymentMethodName: 'Transferencia',
  },
  {
    code: 'F05',
    categoryName: 'Internet y teléfono',
    concept: 'Telefono',
    amount: '700.00',
    dueDay: 28,
    frequency: 'MENSUAL',
    paymentMethodName: 'Transferencia',
  },
] as const;

/** Hoja `Config` — parámetros del año 2026. */
export const BUDGET_DEFAULTS = {
  year: 2026,
  name: 'Presupuesto 2026',
  /** Quincenas!G — el mismo valor en las 24 quincenas. */
  plannedIncomePerPeriod: '8500.00',
  spendThreshold: '0.800',
  dueSoonDays: 3,
  inactivityDays: 5,
  savingGoalPerPeriod: '1500.00',
  paidToleranceAmount: '1.00',
} as const;

/** Fondo de ahorro por defecto (D3): el ahorro se traslada aquí, no se gasta. */
export const DEFAULT_SAVINGS_FUND = {
  name: 'Fondo general',
  currency: 'NIO',
} as const;
