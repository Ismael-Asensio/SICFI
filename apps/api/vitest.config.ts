import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'prisma/**/*.spec.ts', 'test/**/*.spec.ts'],
    // Los de integración tienen su propia config (vitest.integration.config.ts):
    // necesitan .env cargado y tocan Postgres real. Sin esta exclusión, el
    // glob de arriba también los recogería y fallarían aquí por falta de
    // DATABASE_URL — o peor, correrían sin que nadie lo pidiera explícitamente.
    exclude: ['node_modules/**', 'test/integration/**'],
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text', 'lcov'],
      // El DoD de la Fase 3 pide >= 90 % de cobertura DEL DOMINIO.
      // Solo se mide dominio: la infraestructura se cubre en las fases 5 y 11.
      include: ['src/contexts/**/domain/**/*.ts', 'src/shared/domain/**/*.ts'],
      // *.repository.ts son puertos igual que *.port.ts (interfaz + token de
      // inyección): el Symbol solo se ejecuta al cablear el DI real (Fase 5/6).
      exclude: ['**/*.spec.ts', '**/*.port.ts', '**/*.repository.ts', '**/index.ts'],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
});
