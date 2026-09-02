import { describe, expect, it } from 'vitest';

import { CalendarDate } from '../../../shared/domain/calendar-date.vo';
import { Currency } from '../../../shared/domain/currency.vo';
import { Money } from '../../../shared/domain/money.vo';

import { PeriodFactory } from './period-factory.service';
import { Period, type PeriodHalf } from './period.entity';

const NIO = Currency.NIO;
const date = (iso: string): CalendarDate => {
  const result = CalendarDate.fromISO(iso);
  if (!result.ok) throw result.error;
  return result.value;
};

function period(
  month: number,
  half: PeriodHalf,
  plannedIncome: Money | null = Money.unsafe('8500', NIO),
  year = 2026
): Period {
  const blueprint = PeriodFactory.buildYear(year).find(
    (p) => p.month === month && p.half === half
  )!;

  return new Period({
    id: `p-${blueprint.number}`,
    householdId: 'hh-1',
    year,
    number: blueprint.number,
    month: blueprint.month,
    half: blueprint.half,
    startDate: blueprint.startDate,
    endDate: blueprint.endDate,
    plannedIncome,
    plannedIncomeCurrency: NIO,
  });
}

describe('Period — pertenencia de una fecha (RN-03)', () => {
  const q1 = period(3, 'Q1');

  it('incluye ambos extremos del rango', () => {
    expect(q1.contains(date('2026-03-01'))).toBe(true);
    expect(q1.contains(date('2026-03-15'))).toBe(true);
    expect(q1.contains(date('2026-03-08'))).toBe(true);
  });

  it('excluye lo que queda fuera', () => {
    expect(q1.contains(date('2026-02-28'))).toBe(false);
    expect(q1.contains(date('2026-03-16'))).toBe(false);
  });

  it('la frontera Q1/Q2 no deja huecos ni solapa', () => {
    const q2 = period(3, 'Q2');
    expect(q1.contains(date('2026-03-15'))).toBe(true);
    expect(q2.contains(date('2026-03-15'))).toBe(false);
    expect(q2.contains(date('2026-03-16'))).toBe(true);
  });

  it('la Q2 de febrero acaba el 28, y el 29 en bisiesto', () => {
    expect(period(2, 'Q2').contains(date('2026-02-28'))).toBe(true);
    expect(period(2, 'Q2', null, 2024).contains(date('2024-02-29'))).toBe(true);
  });
});

describe('Period — cerrada y activa (RN-04, RN-05)', () => {
  const q1 = period(3, 'Q1'); // 01–15 de marzo

  it('está cerrada solo cuando su fin ya pasó', () => {
    expect(q1.isClosedOn(date('2026-03-16'))).toBe(true);
    expect(q1.isClosedOn(date('2026-03-15'))).toBe(false); // el último día aún cuenta
    expect(q1.isClosedOn(date('2026-03-01'))).toBe(false);
  });

  it('está activa mientras contiene el día de hoy', () => {
    expect(q1.isActiveOn(date('2026-03-10'))).toBe(true);
    expect(q1.isActiveOn(date('2026-03-16'))).toBe(false);
  });

  it('cuenta los días que faltan para cerrar', () => {
    expect(q1.daysUntilCloseFrom(date('2026-03-10'))).toBe(5);
    expect(q1.daysUntilCloseFrom(date('2026-03-15'))).toBe(0);
    expect(q1.daysUntilCloseFrom(date('2026-03-20'))).toBe(-5);
  });
});

describe('Period — duración real', () => {
  it('una Q1 siempre dura 15 días', () => {
    for (const month of [1, 2, 4, 12]) {
      expect(period(month, 'Q1').lengthInDays).toBe(15);
    }
  });

  it('una Q2 dura lo que le deja el mes', () => {
    expect(period(1, 'Q2').lengthInDays).toBe(16); // 16–31
    expect(period(2, 'Q2').lengthInDays).toBe(13); // 16–28
    expect(period(2, 'Q2', null, 2024).lengthInDays).toBe(14); // 16–29 bisiesto
    expect(period(4, 'Q2').lengthInDays).toBe(15); // 16–30
  });
});

describe('Period — ingreso planificado (corrige P12)', () => {
  it('sin ingreso no está planificada', () => {
    expect(period(3, 'Q1', null).hasPlannedIncome).toBe(false);
  });

  it('un ingreso de cero tampoco cuenta como planificado', () => {
    expect(period(3, 'Q1', Money.zero(NIO)).hasPlannedIncome).toBe(false);
  });

  it('con ingreso positivo sí', () => {
    expect(period(3, 'Q1').hasPlannedIncome).toBe(true);
  });
});

describe('Period — identidad y etiqueta', () => {
  it('la igualdad es por id', () => {
    expect(period(3, 'Q1').equals(period(3, 'Q1'))).toBe(true);
    expect(period(3, 'Q1').equals(period(3, 'Q2'))).toBe(false);
  });

  it('la etiqueta es legible', () => {
    expect(period(3, 'Q1').label).toBe('Q1 03/2026');
    expect(period(12, 'Q2').label).toBe('Q2 12/2026');
  });
});
