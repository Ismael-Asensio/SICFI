import { describe, expect, it } from 'vitest';

import {
  buildPeriodCalendar,
  businessDate,
  computeDueDate,
  deriveAppliesTo,
  lastDayOfMonth,
} from './seed-calendar';

/** Formatea como YYYY-MM-DD leyendo en UTC, que es como se persiste un @db.Date. */
const iso = (date: Date): string => date.toISOString().slice(0, 10);

describe('lastDayOfMonth', () => {
  it('devuelve 31, 30 y 28 según el mes', () => {
    expect(lastDayOfMonth(2026, 1)).toBe(31);
    expect(lastDayOfMonth(2026, 4)).toBe(30);
    expect(lastDayOfMonth(2026, 2)).toBe(28);
  });

  it('reconoce febrero de un año bisiesto', () => {
    expect(lastDayOfMonth(2024, 2)).toBe(29);
    expect(lastDayOfMonth(2000, 2)).toBe(29); // divisible por 400
    expect(lastDayOfMonth(1900, 2)).toBe(28); // divisible por 100 pero no por 400
  });
});

describe('businessDate', () => {
  it('ancla al mediodía UTC para que ningún desfase mueva el día', () => {
    const date = businessDate(2026, 3, 15);
    expect(iso(date)).toBe('2026-03-15');
    expect(date.getUTCHours()).toBe(12);
  });
});

describe('buildPeriodCalendar — RN-01, RN-02', () => {
  const periods = buildPeriodCalendar(2026);

  it('genera exactamente 24 quincenas numeradas de 1 a 24', () => {
    expect(periods).toHaveLength(24);
    expect(periods.map((p) => p.number)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
  });

  it('Q1 va del día 1 al 15', () => {
    const enero = periods[0]!;
    expect(enero.half).toBe('Q1');
    expect(iso(enero.startDate)).toBe('2026-01-01');
    expect(iso(enero.endDate)).toBe('2026-01-15');
  });

  it('Q2 va del 16 al fin de mes real, no a un 30 asumido', () => {
    const byMonth = (month: number, half: 'Q1' | 'Q2') =>
      periods.find((p) => p.month === month && p.half === half)!;

    expect(iso(byMonth(1, 'Q2').endDate)).toBe('2026-01-31'); // 31 días
    expect(iso(byMonth(2, 'Q2').endDate)).toBe('2026-02-28'); // febrero
    expect(iso(byMonth(4, 'Q2').endDate)).toBe('2026-04-30'); // 30 días
  });

  it('cierra febrero en 29 en un año bisiesto', () => {
    const febrero2024 = buildPeriodCalendar(2024).find((p) => p.month === 2 && p.half === 'Q2')!;
    expect(iso(febrero2024.endDate)).toBe('2024-02-29');
  });

  it('no deja huecos ni solapamientos entre quincenas consecutivas', () => {
    for (let i = 1; i < periods.length; i += 1) {
      const previous = periods[i - 1]!;
      const current = periods[i]!;

      const dayAfterPrevious = new Date(previous.endDate);
      dayAfterPrevious.setUTCDate(dayAfterPrevious.getUTCDate() + 1);

      expect(iso(current.startDate)).toBe(iso(dayAfterPrevious));
    }
  });

  it('cubre los 365 días del año sin excepción', () => {
    const covered = periods.reduce((total, period) => {
      const days =
        (period.endDate.getTime() - period.startDate.getTime()) / (1000 * 60 * 60 * 24) + 1;
      return total + days;
    }, 0);

    expect(covered).toBe(365);
    expect(
      buildPeriodCalendar(2024).reduce((total, period) => {
        const days =
          (period.endDate.getTime() - period.startDate.getTime()) / (1000 * 60 * 60 * 24) + 1;
        return total + days;
      }, 0)
    ).toBe(366);
  });

  it('cumple number = (month − 1) × 2 + (Q1 ? 1 : 2), igual que el CHECK de la migración', () => {
    for (const period of periods) {
      expect(period.number).toBe((period.month - 1) * 2 + (period.half === 'Q1' ? 1 : 2));
    }
  });
});

describe('deriveAppliesTo — RN-18', () => {
  it('un fijo quincenal aplica a AMBAS quincenas', () => {
    expect(deriveAppliesTo('QUINCENAL', 1)).toBe('AMBAS');
    expect(deriveAppliesTo('QUINCENAL', 28)).toBe('AMBAS');
  });

  it('un fijo mensual cae en Q1 o Q2 según el día de pago', () => {
    expect(deriveAppliesTo('MENSUAL', 1)).toBe('Q1');
    expect(deriveAppliesTo('MENSUAL', 15)).toBe('Q1'); // borde: 15 es Q1
    expect(deriveAppliesTo('MENSUAL', 16)).toBe('Q2'); // borde: 16 ya es Q2
    expect(deriveAppliesTo('MENSUAL', 31)).toBe('Q2');
  });

  it('coincide con los datos precargados de la hoja Fijos', () => {
    expect(deriveAppliesTo('QUINCENAL', 5)).toBe('AMBAS'); // F01 Apoyo Casa
    expect(deriveAppliesTo('QUINCENAL', 1)).toBe('AMBAS'); // F02 Pasajes
    expect(deriveAppliesTo('QUINCENAL', 18)).toBe('AMBAS'); // F03 Perfume
    expect(deriveAppliesTo('QUINCENAL', 12)).toBe('AMBAS'); // F04 Streaming
    expect(deriveAppliesTo('MENSUAL', 28)).toBe('Q2'); // F05 Teléfono
  });
});

describe('computeDueDate — RN-21', () => {
  const calendar2026 = buildPeriodCalendar(2026);
  const period = (month: number, half: 'Q1' | 'Q2') =>
    calendar2026.find((p) => p.month === month && p.half === half)!;

  it('un fijo quincenal vence al cierre de la quincena', () => {
    expect(iso(computeDueDate('QUINCENAL', 5, period(2, 'Q2'), 2026))).toBe('2026-02-28');
    expect(iso(computeDueDate('QUINCENAL', 5, period(3, 'Q1'), 2026))).toBe('2026-03-15');
  });

  it('recorta dueDay = 31 al último día de febrero en vez de reventar', () => {
    // Sin el min(dueDay, díaFinQuincena) esto produciría el 31 de febrero.
    expect(iso(computeDueDate('MENSUAL', 31, period(2, 'Q2'), 2026))).toBe('2026-02-28');
    expect(iso(computeDueDate('MENSUAL', 31, period(2, 'Q2'), 2024))).toBe('2024-02-29');
  });

  it('recorta dueDay = 31 a 30 en los meses de 30 días', () => {
    expect(iso(computeDueDate('MENSUAL', 31, period(4, 'Q2'), 2026))).toBe('2026-04-30');
    expect(iso(computeDueDate('MENSUAL', 31, period(1, 'Q2'), 2026))).toBe('2026-01-31');
  });

  it('recorta al día 15 dentro de una Q1', () => {
    expect(iso(computeDueDate('MENSUAL', 20, period(5, 'Q1'), 2026))).toBe('2026-05-15');
    expect(iso(computeDueDate('MENSUAL', 10, period(5, 'Q1'), 2026))).toBe('2026-05-10');
  });

  it('nunca devuelve una fecha fuera de su propia quincena', () => {
    for (const p of calendar2026) {
      for (const dueDay of [1, 15, 16, 28, 29, 30, 31]) {
        const due = computeDueDate('MENSUAL', dueDay, p, 2026);
        expect(iso(due) >= iso(p.startDate) || iso(due) <= iso(p.endDate)).toBe(true);
        expect(due.getUTCMonth() + 1).toBe(p.month);
      }
    }
  });
});
