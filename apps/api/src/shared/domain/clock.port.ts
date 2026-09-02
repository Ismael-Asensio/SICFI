/**
 * Puerto `Clock`.
 *
 * `new Date()` dentro de `domain/` está prohibido (CLAUDE.md §8): hace que las
 * reglas dependientes de "hoy" —vencimientos, olvidos, alertas— sean imposibles
 * de probar y cambien de resultado según el reloj de la máquina.
 *
 * El adaptador real vive en `shared/infrastructure`; los tests inyectan un reloj
 * fijo.
 */
import type { CalendarDate } from './calendar-date.vo';

export const CLOCK = Symbol('CLOCK');

export interface Clock {
  /** Instante actual. */
  now(): Date;

  /**
   * Día del calendario que es "hoy" en una zona horaria.
   * Siempre la del household: a las 23:00 en Managua, en UTC ya es mañana.
   */
  today(timeZone: string): CalendarDate;
}
