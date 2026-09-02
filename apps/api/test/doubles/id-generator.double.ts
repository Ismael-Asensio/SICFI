import type { IdGenerator } from '../../src/shared/domain/id-generator.port';

/** Ids deterministas y legibles en los asserts: 'id-1', 'id-2'… */
export class SequentialIdGenerator implements IdGenerator {
  private counter = 0;

  generate(): string {
    this.counter += 1;
    return `id-${this.counter}`;
  }
}
