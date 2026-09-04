import type { UnitOfWork } from '../../src/shared/domain/unit-of-work.port';

/** Ejecuta `work` tal cual, sin ninguna transacción real: basta para dobles en memoria. */
export class NoopUnitOfWork implements UnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }
}
