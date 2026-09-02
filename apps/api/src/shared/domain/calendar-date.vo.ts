/**
 * `CalendarDate` — una fecha de negocio: año, mes y día. Sin hora, sin zona.
 *
 * Es el tipo que corresponde a las columnas `@db.Date`. Existe para eliminar de
 * raíz dos bugs del checklist de depuración:
 *
 *   · "un gasto se movió al día anterior" — pasa al guardar un instante con zona
 *     donde el negocio solo quería un día del calendario;
 *   · "un gasto aparece en la quincena equivocada" — pasa al usar el `new Date()`
 *     del cliente en vez del reloj del servidor con la zona del household.
 *
 * Un `Date` de JS es un instante en la línea del tiempo; el 5 de enero **no** lo
 * es. Al no ser representables, esos errores no se pueden cometer: la única
 * forma de obtener un `CalendarDate` desde un instante es `fromInstant`, que
 * **exige** la zona horaria.
 */
import { ValidationError, type DomainError } from './domain-error';
import { err, ok, type Result } from './result';
import { ValueObject } from './value-object';

const MILLISECONDS_PER_DAY = 86_400_000;
const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export class CalendarDate extends ValueObject {
  private constructor(
    readonly year: number,
    /** 1..12 — a diferencia de `Date`, aquí enero es 1, no 0. */
    readonly month: number,
    readonly day: number
  ) {
    super();
    this.seal();
  }

  // ─────────────────────────── Construcción ───────────────────────────

  static of(year: number, month: number, day: number): Result<CalendarDate, DomainError> {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
      return err(new ValidationError('Una fecha de calendario exige enteros', { year, month, day }));
    }
    if (month < 1 || month > 12) {
      return err(new ValidationError(`Mes fuera de rango: ${month}`, { month }));
    }

    const lastDay = CalendarDate.lastDayOfMonth(year, month);
    if (day < 1 || day > lastDay) {
      return err(
        new ValidationError(
          `El día ${day} no existe en ${month}/${year} (el mes tiene ${lastDay} días)`,
          { year, month, day, lastDay }
        )
      );
    }

    return ok(new CalendarDate(year, month, day));
  }

  /**
   * Variante para constantes ya validadas y para uso interno del dominio.
   * Lanza si la fecha no existe: es un error del programador, no del usuario.
   */
  static unsafe(year: number, month: number, day: number): CalendarDate {
    const result = CalendarDate.of(year, month, day);
    if (!result.ok) throw result.error;
    return result.value;
  }

  static fromISO(value: string): Result<CalendarDate, DomainError> {
    const match = ISO_PATTERN.exec(value);
    if (!match) {
      return err(new ValidationError(`Fecha ISO inválida: "${value}". Se espera YYYY-MM-DD`));
    }
    return CalendarDate.of(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  /**
   * Día del calendario en el que cae un instante **para una zona horaria dada**.
   *
   * Exigir la zona es el punto de todo esto: a las 23:00 del 5 de enero en
   * Managua ya es 6 de enero en UTC. Sin la zona del household, un movimiento
   * registrado de noche caería en la quincena equivocada.
   */
  static fromInstant(instant: Date, timeZone: string): CalendarDate {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(instant);

    const read = (type: 'year' | 'month' | 'day'): number =>
      Number(parts.find((part) => part.type === type)?.value ?? Number.NaN);

    return CalendarDate.unsafe(read('year'), read('month'), read('day'));
  }

  /**
   * Reconstruye desde un `Date` que solo transporta una fecha (columna `@db.Date`).
   * El driver de Postgres devuelve esas columnas como medianoche UTC, así que se
   * leen los componentes en UTC — nunca en la zona local del proceso.
   */
  static fromDbDate(value: Date): CalendarDate {
    return CalendarDate.unsafe(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }

  /** 28, 29, 30 o 31. Nunca se asume 30 (RN-21). */
  static lastDayOfMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  static isLeapYear(year: number): boolean {
    return CalendarDate.lastDayOfMonth(year, 2) === 29;
  }

  // ─────────────────────────── Conversión ───────────────────────────

  toISO(): string {
    const month = String(this.month).padStart(2, '0');
    const day = String(this.day).padStart(2, '0');
    return `${this.year}-${month}-${day}`;
  }

  /**
   * `Date` para persistir en una columna `@db.Date`, anclado a las 12:00 UTC.
   *
   * El mediodía deja 12 h de margen a cada lado: ningún desfase de zona del
   * driver o del proceso puede empujar la fecha al día anterior o al siguiente.
   */
  toUtcDate(): Date {
    return new Date(Date.UTC(this.year, this.month - 1, this.day, 12, 0, 0));
  }

  /** Días transcurridos desde la época, para aritmética exacta de días. */
  private get epochDay(): number {
    return Date.UTC(this.year, this.month - 1, this.day) / MILLISECONDS_PER_DAY;
  }

  // ─────────────────────────── Aritmética ───────────────────────────

  addDays(days: number): CalendarDate {
    const shifted = new Date((this.epochDay + days) * MILLISECONDS_PER_DAY);
    return CalendarDate.unsafe(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth() + 1,
      shifted.getUTCDate()
    );
  }

  /** Días de `this` a `other`. Positivo si `other` es posterior. */
  daysUntil(other: CalendarDate): number {
    return other.epochDay - this.epochDay;
  }

  /** Último día del mes de esta fecha. */
  endOfMonth(): CalendarDate {
    return CalendarDate.unsafe(
      this.year,
      this.month,
      CalendarDate.lastDayOfMonth(this.year, this.month)
    );
  }

  // ─────────────────────────── Comparación ───────────────────────────

  /** Negativo si `this` es anterior, 0 si igual, positivo si posterior. */
  compare(other: CalendarDate): number {
    return this.epochDay - other.epochDay;
  }

  isBefore(other: CalendarDate): boolean {
    return this.compare(other) < 0;
  }

  isAfter(other: CalendarDate): boolean {
    return this.compare(other) > 0;
  }

  isSameOrBefore(other: CalendarDate): boolean {
    return this.compare(other) <= 0;
  }

  isSameOrAfter(other: CalendarDate): boolean {
    return this.compare(other) >= 0;
  }

  static min(a: CalendarDate, b: CalendarDate): CalendarDate {
    return a.isBefore(b) ? a : b;
  }

  static max(a: CalendarDate, b: CalendarDate): CalendarDate {
    return a.isAfter(b) ? a : b;
  }

  protected components(): readonly unknown[] {
    return [this.year, this.month, this.day];
  }

  toString(): string {
    return this.toISO();
  }
}
