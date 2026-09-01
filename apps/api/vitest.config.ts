import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'prisma/**/*.spec.ts', 'test/**/*.spec.ts'],
    globals: false,
  },
});
