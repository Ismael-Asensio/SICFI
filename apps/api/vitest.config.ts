import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'prisma/**/*.spec.ts', 'test/**/*.spec.ts'],
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text', 'lcov'],
      // El DoD de la Fase 3 pide >= 90 % de cobertura DEL DOMINIO.
      // Solo se mide dominio: la infraestructura se cubre en las fases 5 y 11.
      include: ['src/contexts/**/domain/**/*.ts', 'src/shared/domain/**/*.ts'],
      exclude: ['**/*.spec.ts', '**/*.port.ts', '**/index.ts'],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
});
