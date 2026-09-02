import { describe, expect, it } from 'vitest';

import { CalendarDate } from './calendar-date.vo';
import { Currency } from './currency.vo';
import { BusinessRuleError, DomainError, ValidationError } from './domain-error';
import { domainEvent, type DomainEvent } from './domain-event';
import { AggregateRoot, Entity } from './entity';
import { ExchangeRate } from './exchange-rate.vo';
import { Money } from './money.vo';
import { Percentage } from './percentage.vo';
import {
  andThen,
  combine,
  combineAll,
  err,
  isErr,
  isOk,
  map,
  mapErr,
  ok,
  unwrapOr,
  type Result,
} from './result';
import { ValueObject } from './value-object';

const NIO = Currency.NIO;
const boom = new ValidationError('boom');

describe('Result — constructores y guardas', () => {
  it('ok sin argumento produce un Ok<void>', () => {
    const result = ok();
    expect(result.ok).toBe(true);
    expect(isOk(result)).toBe(true);
  });

  it('estrecha el tipo con la discriminante', () => {
    const result: Result<number> = ok(42);
    expect(isOk(result) && result.value).toBe(42);
    expect(isErr(result)).toBe(false);
  });

  it('las instancias están congeladas', () => {
    expect(Object.isFrozen(ok(1))).toBe(true);
    expect(Object.isFrozen(err(boom))).toBe(true);
  });
});

describe('Result — combinadores', () => {
  it('map transforma el valor y deja pasar el error', () => {
    expect(unwrapOr(map(ok(2), (n) => n * 3), 0)).toBe(6);
    expect(unwrapOr(map(err<DomainError>(boom), (n: number) => n * 3), -1)).toBe(-1);
  });

  it('mapErr transforma el error y deja pasar el valor', () => {
    const mapped = mapErr(err(boom), (error) => error.message.toUpperCase());
    expect(isErr(mapped) && mapped.error).toBe('BOOM');
    expect(unwrapOr(mapErr(ok(5), () => 'x'), 0)).toBe(5);
  });

  it('andThen encadena sin anidar ifs y corta en el primer fallo', () => {
    const double = (n: number): Result<number> => ok(n * 2);
    const fail = (): Result<number> => err(boom);

    expect(unwrapOr(andThen(ok(3), double), 0)).toBe(6);
    expect(isErr(andThen(ok(3), fail))).toBe(true);
    expect(isErr(andThen(err<DomainError>(boom), double))).toBe(true);
  });

  it('unwrapOr devuelve el respaldo solo en caso de error', () => {
    expect(unwrapOr(ok('valor'), 'respaldo')).toBe('valor');
    expect(unwrapOr(err<DomainError>(boom) as Result<string>, 'respaldo')).toBe('respaldo');
  });

  it('combine agrega los valores y devuelve el primer error', () => {
    const combined = combine([ok(1), ok('dos'), ok(true)] as const);
    expect(isOk(combined) && combined.value).toEqual([1, 'dos', true]);

    const failed = combine([ok(1), err(boom), err(new ValidationError('otro'))] as const);
    expect(isErr(failed) && (failed.error as DomainError).message).toBe('boom');
  });

  it('combineAll acumula TODOS los errores, para un formulario', () => {
    const all = combineAll([
      ok(1),
      err(new ValidationError('campo A')),
      err(new ValidationError('campo B')),
    ]);

    expect(isErr(all)).toBe(true);
    if (isErr(all)) {
      expect(all.error).toHaveLength(2);
      expect(all.error.map((e) => e.message)).toEqual(['campo A', 'campo B']);
    }

    const none = combineAll([ok(1), ok(2)]);
    expect(isOk(none) && none.value).toEqual([1, 2]);
  });
});

describe('DomainError', () => {
  it('conserva code, mensaje y detalles', () => {
    const error = new ValidationError('mal', { campo: 'monto' });
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.details.campo).toBe('monto');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(DomainError);
    expect(error.name).toBe('ValidationError');
  });

  it('BusinessRuleError cita siempre la regla infringida', () => {
    const error = new BusinessRuleError('RN-41', 'saldo insuficiente', { fondo: 'general' });
    expect(error.details.rule).toBe('RN-41');
    expect(error.details.fondo).toBe('general');
  });

  it('toJSON produce una forma serializable estable', () => {
    expect(new ValidationError('mal', { a: 1 }).toJSON()).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'mal',
      details: { a: 1 },
    });
  });
});

describe('Entity y AggregateRoot', () => {
  class Movimiento extends Entity<string> {
    constructor(id: string, readonly concepto: string) {
      super(id);
    }
  }
  class Otra extends Entity<string> {
    constructor(id: string) {
      super(id);
    }
  }

  it('la igualdad es por identidad, no por valor', () => {
    expect(new Movimiento('1', 'a').equals(new Movimiento('1', 'b'))).toBe(true);
    expect(new Movimiento('1', 'a').equals(new Movimiento('2', 'a'))).toBe(false);
  });

  it('dos entidades de clases distintas nunca son iguales', () => {
    expect(new Movimiento('1', 'a').equals(new Otra('1'))).toBe(false);
    expect(new Movimiento('1', 'a').equals(null)).toBe(false);
    expect(new Movimiento('1', 'a').equals('1')).toBe(false);
  });

  it('una raíz de agregado acumula y vacía sus eventos', () => {
    class Cuenta extends AggregateRoot<string> {
      constructor(id: string) {
        super(id);
      }
      registrar(nombre: string): void {
        this.record(domainEvent(nombre, this.id, 'hh-1', new Date('2026-03-10T12:00:00Z')));
      }
    }

    const cuenta = new Cuenta('c-1');
    expect(cuenta.hasPendingEvents).toBe(false);

    cuenta.registrar('MovimientoRegistrado');
    cuenta.registrar('SaldoActualizado');
    expect(cuenta.hasPendingEvents).toBe(true);

    const eventos = cuenta.pullEvents();
    expect(eventos.map((e: DomainEvent) => e.name)).toEqual(['MovimientoRegistrado', 'SaldoActualizado']);
    // Vaciar evita publicar dos veces el mismo evento.
    expect(cuenta.pullEvents()).toHaveLength(0);
    expect(cuenta.hasPendingEvents).toBe(false);
  });

  it('un evento de dominio es inmutable', () => {
    const evento = domainEvent('Algo', 'a-1', 'hh-1', new Date(), { monto: '100' });
    expect(Object.isFrozen(evento)).toBe(true);
    expect(evento.payload.monto).toBe('100');
  });
});

describe('ValueObject — igualdad estructural', () => {
  class Punto extends ValueObject {
    constructor(readonly x: number, readonly y: number) {
      super();
      this.seal();
    }
    protected components(): readonly unknown[] {
      return [this.x, this.y];
    }
  }
  class Otro extends ValueObject {
    constructor(readonly x: number) {
      super();
      this.seal();
    }
    protected components(): readonly unknown[] {
      return [this.x];
    }
  }

  it('compara por valor', () => {
    expect(new Punto(1, 2).equals(new Punto(1, 2))).toBe(true);
    expect(new Punto(1, 2).equals(new Punto(1, 3))).toBe(false);
  });

  it('no confunde VOs de clases distintas ni valores sueltos', () => {
    expect(new Punto(1, 2).equals(new Otro(1))).toBe(false);
    expect(new Punto(1, 2).equals(null)).toBe(false);
    expect(new Punto(1, 2).equals({ x: 1, y: 2 })).toBe(false);
  });

  it('la identidad implica igualdad', () => {
    const punto = new Punto(1, 2);
    expect(punto.equals(punto)).toBe(true);
  });

  it('delega en el equals de los componentes que lo traen (Decimal)', () => {
    // Dos Decimal iguales no son === ; sin esta delegación dos importes
    // idénticos se verían como distintos.
    expect(Money.unsafe('100.00', NIO).equals(Money.unsafe('100.00', NIO))).toBe(true);
  });
});

describe('Percentage', () => {
  it('construye desde fracción y desde porcentaje', () => {
    expect(Percentage.unsafe('0.8').toPercent().toNumber()).toBe(80);
    const fromPercent = Percentage.fromPercent(80);
    expect(fromPercent.ok && fromPercent.value.toNumber()).toBe(0.8);
  });

  it('rechaza negativos y valores no numéricos', () => {
    expect(Percentage.fromRatio(-0.1).ok).toBe(false);
    expect(Percentage.fromRatio('no').ok).toBe(false);
    expect(Percentage.fromRatio(Number.POSITIVE_INFINITY).ok).toBe(false);
  });

  it('admite pasar del 100 %: un sobregasto es real', () => {
    const over = Percentage.unsafe('1.2');
    expect(over.exceedsWhole).toBe(true);
    expect(Percentage.unsafe('0.9').exceedsWhole).toBe(false);
  });

  it('compara con >= para el umbral (RN-16)', () => {
    const umbral = Percentage.unsafe('0.8');
    expect(Percentage.unsafe('0.8').isAtLeast(umbral)).toBe(true);
    expect(Percentage.unsafe('0.79').isAtLeast(umbral)).toBe(false);
    expect(Percentage.unsafe('0.81').isGreaterThan(umbral)).toBe(true);
  });

  it('formatea para la UI', () => {
    expect(Percentage.unsafe('0.8').toPercentString()).toBe('80.0');
    expect(Percentage.unsafe('0.8567').toPercentString(2)).toBe('85.67');
    expect(Percentage.unsafe('0.8').toString()).toBe('80.0 %');
    expect(Percentage.ZERO.isZero()).toBe(true);
  });

  it('la igualdad es por valor', () => {
    expect(Percentage.unsafe('0.8').equals(Percentage.unsafe('0.80'))).toBe(true);
  });
});

describe('Salidas de texto', () => {
  it('Money, Currency, CalendarDate y ExchangeRate se imprimen legibles', () => {
    expect(Money.unsafe('1234.5', NIO).toString()).toBe('1234.50 NIO');
    expect(Money.unsafe('1234.5', NIO).toNumber()).toBe(1234.5);
    expect(Money.unsafe('1234.5', NIO).toDecimal().toFixed(2)).toBe('1234.50');
    expect(NIO.toString()).toBe('NIO');
    expect(CalendarDate.unsafe(2026, 3, 5).toString()).toBe('2026-03-05');

    const rate = ExchangeRate.of({
      base: NIO,
      quote: Currency.USD,
      date: CalendarDate.unsafe(2026, 3, 10),
      rate: '36.6',
      source: 'BCN',
    });
    expect(rate.ok && rate.value.toString()).toContain('1 USD = 36.6 NIO');
    expect(rate.ok && rate.value.source).toBe('BCN');
  });

  it('los factories unsafe lanzan ante un valor inválido', () => {
    expect(() => Money.unsafe('no', NIO)).toThrow();
    expect(() => Currency.unsafe('XX')).toThrow();
    expect(() => CalendarDate.unsafe(2026, 2, 30)).toThrow();
    expect(() => Percentage.unsafe(-1)).toThrow();
  });
});
