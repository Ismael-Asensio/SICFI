import 'dotenv/config';

import { afterAll } from 'vitest';

import { sharedPrisma } from './support/shared-prisma';

if (!process.env.DATABASE_URL || !process.env.DIRECT_URL) {
  throw new Error(
    'Faltan DATABASE_URL/DIRECT_URL. Los tests de integración necesitan apps/api/.env ' +
      'apuntando al pooler de sicfi-dev — ver CLAUDE.md §11.'
  );
}

// Con `singleFork: true` todos los archivos de esta corrida comparten un solo
// proceso, así que la conexión se cierra una única vez al final de todo.
afterAll(async () => {
  await sharedPrisma.$disconnect();
});
