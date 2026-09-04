/**
 * Adaptador real de `ExchangeRateProvider`. RN-37.
 *
 * Resuelve, para una fecha, la tasa exacta o la más reciente anterior;
 * primero busca una tasa propia del household, y si no hay ninguna, cae a una
 * tasa global (`household_id IS NULL`, p. ej. importada del BCN).
 */
import { Injectable } from '@nestjs/common';

import { CalendarDate } from '../../domain/calendar-date.vo';
import { Currency } from '../../domain/currency.vo';
import type { ExchangeRateProvider, ExchangeRateQuery } from '../../domain/exchange-rate-provider.port';
import { ExchangeRate, type ExchangeRateSource } from '../../domain/exchange-rate.vo';

import { PrismaRepositoryBase } from './prisma-repository.base';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaExchangeRateAdapter extends PrismaRepositoryBase implements ExchangeRateProvider {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async findEffectiveRate(query: ExchangeRateQuery): Promise<ExchangeRate | null> {
    const target = query.date.toUtcDate();
    const base = query.base.code;
    const quote = query.quote.code;

    const householdRate = await this.client.exchangeRate.findFirst({
      where: { householdId: query.householdId, baseCurrency: base, quoteCurrency: quote, date: { lte: target } },
      orderBy: { date: 'desc' },
    });
    if (householdRate) return this.toDomain(householdRate);

    const globalRate = await this.client.exchangeRate.findFirst({
      where: { householdId: null, baseCurrency: base, quoteCurrency: quote, date: { lte: target } },
      orderBy: { date: 'desc' },
    });
    return globalRate ? this.toDomain(globalRate) : null;
  }

  private toDomain(row: {
    baseCurrency: string;
    quoteCurrency: string;
    date: Date;
    rate: { toString(): string };
    source: string;
  }): ExchangeRate {
    const result = ExchangeRate.of({
      base: Currency.unsafe(row.baseCurrency),
      quote: Currency.unsafe(row.quoteCurrency),
      date: CalendarDate.fromDbDate(row.date),
      rate: row.rate.toString(),
      source: row.source as ExchangeRateSource,
    });
    if (!result.ok) throw result.error;
    return result.value;
  }
}
