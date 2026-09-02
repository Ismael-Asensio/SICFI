/**
 * Catálogo por defecto para un household nuevo. Hoja `Listas` del Excel (§1.3).
 *
 * Universal para cualquier usuario — a diferencia de `prisma/seed-data.ts`,
 * que además incluye los 5 fijos del presupuesto REAL del propietario del
 * repositorio y solo debe usarse para sembrar la base de desarrollo, nunca
 * para el alta de un usuario real. `BootstrapUserUseCase` importa de aquí.
 */
import type { CategoryKind } from './category.entity';

export interface DefaultCategory {
  name: string;
  kind: CategoryKind;
}

/** 24 categorías con su tipo sugerido, en el orden del Excel. */
export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
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

/** 7 métodos de pago. */
export const DEFAULT_PAYMENT_METHODS: readonly string[] = [
  'Efectivo',
  'Tarjeta de débito',
  'Tarjeta de crédito',
  'Transferencia',
  'Billetera móvil',
  'Débito automático',
  'Otro',
] as const;

export const DEFAULT_SAVINGS_FUND_NAME = 'Fondo general';
