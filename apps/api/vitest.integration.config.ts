import { defineConfig } from 'vitest/config';

/**
 * Config separada de la de unit tests a propósito: estos SÍ tocan Postgres
 * real (`sicfi-dev`, vía el pooler — ver CLAUDE.md §11), así que necesitan
 * `.env` cargado y más margen de tiempo por la latencia de red hacia AWS.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/integration/**/*.spec.ts'],
    globals: false,
    setupFiles: ['./test/integration/setup.ts'],
    testTimeout: 45_000,
    hookTimeout: 45_000,
    // Un solo hilo: varios tests creando/borrando households en paralelo
    // contra la misma base no aporta nada y complica la depuración.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
