import { describe, expect, it } from 'vitest';

import { CalendarDate } from './calendar-date.vo';

const date = (iso: string): CalendarDate => {
  const result = CalendarDate.fromISO(iso);
  if (!result.ok) throw result.error;
  return result.value;
};

describe('CalendarDate — construcción', () => {
  it('rechaza fechas que no existen en el calendario', () => {
    expect(CalendarDate.of(2026, 2, 30).ok).toBe(false); // 30 de febrero
    expect(CalendarDate.of(2026, 2, 29).ok).toBe(false); // 2026 no es bisiesto
    expect(CalendarDate.of(2026, 4, 31).ok).toBe(false); // abril tiene 30
    expect(CalendarDate.of(2026, 13, 1).ok).toBe(false); // mes 13
    expect(CalendarDate.of(2026, 0, 1).ok).toBe(false); // mes 0
    expect(CalendarDate.of(2026, 1, 0).ok).toBe(false); // día 0
  });

  it('acepta el 29 de febrero solo en año bisiesto', () => {
    expect(CalendarDate.of(2024, 2, 29).ok).toBe(true);
    expect(CalendarDate.of(2026, 2, 29).ok).toBe(false);
  });

  it('rechaza valores no enteros', () => {
    expect(CalendarDate.of(2026, 1, 1.5).ok).toBe(false);
    expect(CalendarDate.of(2026.5, 1, 1).ok).toBe(false);
  });

  it('parsea ISO y rechaza formatos que no lo son', () => {
    expect(date('2026-03-15').toISO()).toBe('2026-03-15');
    expect(CalendarDate.fromISO('15/03/2026').ok).toBe(false);
    expect(CalendarDate.fromISO('2026-3-15').ok).toBe(false);
    expect(CalendarDate.fromISO('2026-02-30').ok).toBe(false);
  });
});

describe('CalendarDate — lastDayOfMonth y años bisiestos', () => {
  it('devuelve el último día real de cada mes de 2026', () => {
    const expected = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    expected.forEach((days, index) => {
      expect(CalendarDate.lastDayOfMonth(2026, index + 1)).toBe(days);
    });
  });

  it('aplica la regla completa de los años bisiestos', () => {
    expect(CalendarDate.isLeapYear(2024)).toBe(true); // divisible por 4
    expect(CalendarDate.isLeapYear(2026)).toBe(false);
    expect(CalendarDate.isLeapYear(1900)).toBe(false); // por 100 pero no por 400
    expect(CalendarDate.isLeapYear(2000)).toBe(true); // por 400
  });
});

describe('CalendarDate — zona horaria (P4 del Excel)', () => {
  it('a las 23:00 en Managua sigue siendo el mismo día, aunque en UTC ya sea el siguiente', () => {
    // 2026-01-05 23:00 en Managua (UTC−6) = 2026-01-06 05:00 UTC
    const instant = new Date('2026-01-06T05:00:00Z');

    expect(CalendarDate.fromInstant(instant, 'America/Managua').toISO()).toBe('2026-01-05');
    expect(CalendarDate.fromInstant(instant, 'UTC').toISO()).toBe('2026-01-06');
  });

  it('el cambio de quincena depende de la zona: día 15 vs día 16', () => {
    // 2026-01-15 23:30 en Managua = 2026-01-16 05:30 UTC.
    // En Managua sigue siendo Q1; en UTC ya sería Q2 — la quincena equivocada.
    const instant = new Date('2026-01-16T05:30:00Z');
    expect(CalendarDate.fromInstant(instant, 'America/Managua').day).toBe(15);
    expect(CalendarDate.fromInstant(instant, 'UTC').day).toBe(16);
  });

  it('el cambio de año depende de la zona', () => {
    // 2026-12-31 20:00 en Managua = 2027-01-01 02:00 UTC
    const instant = new Date('2027-01-01T02:00:00Z');
    expect(CalendarDate.fromInstant(instant, 'America/Managua').toISO()).toBe('2026-12-31');
    expect(CalendarDate.fromInstant(instant, 'UTC').toISO()).toBe('2027-01-01');
  });
});

describe('CalendarDate — ida y vuelta a la base de datos', () => {
  it('toUtcDate ancla al mediodía para que ningún desfase mueva el día', () => {
    const utc = date('2026-03-15').toUtcDate();
    expect(utc.toISOString()).toBe('2026-03-15T12:00:00.000Z');
  });

  it('sobrevive al viaje de ida y vuelta contra la columna @db.Date', () => {
    for (const iso of ['2026-01-01', '2026-02-28', '2026-06-30', '2026-12-31']) {
      expect(CalendarDate.fromDbDate(date(iso).toUtcDate()).toISO()).toBe(iso);
    }
  });

  it('lee una fecha que el driver devuelve a medianoche UTC', () => {
    expect(CalendarDate.fromDbDate(new Date('2026-03-15T00:00:00Z')).toISO()).toBe('2026-03-15');
  });
});

describe('CalendarDate — aritmética', () => {
  it('suma y resta días cruzando el fin de mes', () => {
    expect(date('2026-01-31').addDays(1).toISO()).toBe('2026-02-01');
    expect(date('2026-02-28').addDays(1).toISO()).toBe('2026-03-01');
    expect(date('2024-02-28').addDays(1).toISO()).toBe('2024-02-29'); // bisiesto
    expect(date('2026-03-01').addDays(-1).toISO()).toBe('2026-02-28');
  });

  it('suma y resta días cruzando el fin de año', () => {
    expect(date('2026-12-31').addDays(1).toISO()).toBe('2027-01-01');
    expect(date('2026-01-01').addDays(-1).toISO()).toBe('2025-12-31');
  });

  it('cuenta los días entre dos fechas con signo', () => {
    expect(date('2026-01-01').daysUntil(date('2026-01-16'))).toBe(15);
    expect(date('2026-01-16').daysUntil(date('2026-01-01'))).toBe(-15);
    expect(date('2026-01-01').daysUntil(date('2026-01-01'))).toBe(0);
    expect(date('2026-01-01').daysUntil(date('2027-01-01'))).toBe(365);
    expect(date('2024-01-01').daysUntil(date('2025-01-01'))).toBe(366);
  });

  it('endOfMonth respeta la longitud real del mes', () => {
    expect(date('2026-02-10').endOfMonth().toISO()).toBe('2026-02-28');
    expect(date('2024-02-10').endOfMonth().toISO()).toBe('2024-02-29');
    expect(date('2026-04-10').endOfMonth().toISO()).toBe('2026-04-30');
  });
});

describe('CalendarDate — comparación', () => {
  it('ordena correctamente', () => {
    const early = date('2026-01-15');
    const late = date('2026-06-30');

    expect(early.isBefore(late)).toBe(true);
    expect(late.isAfter(early)).toBe(true);
    expect(early.isSameOrBefore(early)).toBe(true);
    expect(early.isSameOrAfter(early)).toBe(true);
    expect(early.isBefore(early)).toBe(false);
  });

  it('la igualdad es por valor, no por identidad', () => {
    expect(date('2026-01-15').equals(date('2026-01-15'))).toBe(true);
    expect(date('2026-01-15').equals(date('2026-01-16'))).toBe(false);
  });

  it('min y max eligen la fecha correcta', () => {
    const a = date('2026-01-15');
    const b = date('2026-06-30');
    expect(CalendarDate.min(a, b).toISO()).toBe('2026-01-15');
    expect(CalendarDate.max(a, b).toISO()).toBe('2026-06-30');
  });

  it('la instancia está congelada', () => {
    expect(Object.isFrozen(date('2026-01-15'))).toBe(true);
  });
});
