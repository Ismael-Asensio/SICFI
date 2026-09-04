import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * E2E: levanta la app Nest completa (guards incluidos) contra Postgres real.
 *
 * Se compila con SWC y no con el esbuild por defecto de Vitest porque **esbuild
 * no implementa `emitDecoratorMetadata`**, y sin esos metadatos la inyección de
 * dependencias de Nest no sabe qué tipo pide cada parámetro del constructor:
 * la app ni arranca. Es el mismo motivo por el que el `nest build` normal sí
 * funciona (usa tsc) y estos tests no lo harían.
 */
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    environment: 'node',
    include: ['test/e2e/**/*.spec.ts'],
    globals: false,
    setupFiles: ['./test/integration/setup.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
