import type {
  ExchangeRateProvider,
  ExchangeRateQuery,
} from '../../src/shared/domain/exchange-rate-provider.port';
import type { ExchangeRate } from '../../src/shared/domain/exchange-rate.vo';

/** RN-37: tasa exacta de la fecha, o la más reciente ANTERIOR; nunca una posterior. */
export class InMemoryExchangeRateProvider implements ExchangeRateProvider {
  constructor(private rates: ExchangeRate[] = []) {}

  add(rate: ExchangeRate): void {
    this.rates.push(rate);
  }

  findEffectiveRate(query: ExchangeRateQuery): Promise<ExchangeRate | null> {
    const applicable = this.rates
      .filter((rate) => rate.base.equals(query.base) && rate.quote.equals(query.quote))
      .filter((rate) => rate.date.isSameOrBefore(query.date))
      .sort((a, b) => b.date.compare(a.date));

    return Promise.resolve(applicable[0] ?? null);
  }
}
