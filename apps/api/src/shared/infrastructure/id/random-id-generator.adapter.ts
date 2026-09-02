/**
 * Adaptador real de `IdGenerator`.
 *
 * Usa `crypto.randomUUID()` (nativo de Node, sin dependencias) en vez de
 * replicar el `cuid()` de Prisma: el formato del id no importa mientras sea
 * único y quepa en la columna `TEXT`. Prisma acepta un id explícito en
 * `create()` aunque el campo tenga `@default(cuid())` — el default solo se usa
 * si el cliente no manda ningún valor.
 */
import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { IdGenerator } from '../../domain/id-generator.port';

@Injectable()
export class RandomIdGenerator implements IdGenerator {
  generate(): string {
    return randomUUID();
  }
}
