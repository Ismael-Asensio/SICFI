/**
 * Adaptador real del puerto `Clock`.
 *
 * Es el **único** sitio de la aplicación donde se llama a `new Date()` sin
 * argumentos. Cualquier otro uso hace que una regla dependiente de "hoy" cambie
 * de resultado según la máquina y sea imposible de probar.
 */
import { Injectable } from '@nestjs/common';

import { CalendarDate } from '../../domain/calendar-date.vo';
import type { Clock } from '../../domain/clock.port';

@Injectable()
export class SystemClockAdapter implements Clock {
  now(): Date {
    return new Date();
  }

  today(timeZone: string): CalendarDate {
    return CalendarDate.fromInstant(this.now(), timeZone);
  }
}

/**
 * Reloj fijo para tests y para reproducir un bug en una fecha concreta.
 * Vive junto al adaptador real para que no haya dos definiciones de "hoy".
 */
export class FixedClock implements Clock {
  constructor(private readonly instant: Date) {}

  static atISO(isoInstant: string): FixedClock {
    return new FixedClock(new Date(isoInstant));
  }

  now(): Date {
    return new Date(this.instant.getTime());
  }

  today(timeZone: string): CalendarDate {
    return CalendarDate.fromInstant(this.instant, timeZone);
  }
}
