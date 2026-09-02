const js = require('@eslint/js');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const boundaries = require('eslint-plugin-boundaries');

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.next/**',
      'build/**',
      'coverage/**',
      '**/*.tsbuildinfo',
    ],
  },
  {
    files: ['**/*.{js,ts,tsx,jsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        // Turbo lanza eslint DENTRO de cada workspace, así que estas rutas se
        // resuelven contra el paquete, no contra la raíz. El comodín recoge
        // tsconfig.json y también tsconfig.spec/scripts.json — necesarios
        // porque el tsconfig de build excluye los *.spec.ts.
        // Un patrón que no casa con nada se ignora sin error.
        project: [
          './tsconfig*.json',
          './apps/*/tsconfig*.json',
          './packages/*/tsconfig*.json',
        ],
        sourceType: 'module',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      // La regla base no entiende las sobrecargas de función de TypeScript.
      'no-redeclare': 'off',
      '@typescript-eslint/no-redeclare': 'error',
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  //  Regla de dependencia hexagonal — INVIOLABLE (CLAUDE.md §4)
  //
  //      domain          →  no importa NADA (ni Prisma, ni Nest, ni Zod)
  //      application     →  solo importa domain
  //      infrastructure  →  importa domain y application
  //
  //  `shared/domain` es el shared kernel (Money, CalendarDate, Result…): el
  //  dominio de cualquier contexto puede importarlo, y él mismo está sujeto a
  //  las mismas restricciones de dependencias externas.
  // ───────────────────────────────────────────────────────────────────────
  {
    files: ['apps/api/src/**/*.ts'],
    plugins: { boundaries },
    settings: {
      // Sin el resolver de TypeScript, boundaries no sabe seguir un import sin
      // extensión hasta su .ts y da por buena cualquier dependencia entre capas.
      'import/resolver': {
        typescript: { project: './apps/api/tsconfig.json' },
      },
      'boundaries/include': ['**/src/**/*.ts'],
      'boundaries/elements': [
        { type: 'shared-domain', pattern: '**/src/shared/domain/**', mode: 'full' },
        { type: 'shared-infra', pattern: '**/src/shared/infrastructure/**', mode: 'full' },
        { type: 'domain', pattern: '**/src/contexts/*/domain/**', mode: 'full' },
        { type: 'application', pattern: '**/src/contexts/*/application/**', mode: 'full' },
        {
          type: 'infrastructure',
          pattern: '**/src/contexts/*/infrastructure/**',
          mode: 'full',
        },
        { type: 'app-root', pattern: '**/src/*.ts', mode: 'full' },
      ],
    },
    rules: {
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            // El dominio solo habla con dominio y con el kernel compartido.
            { from: ['domain'], allow: ['domain', 'shared-domain'] },
            { from: ['shared-domain'], allow: ['shared-domain'] },

            // La aplicación orquesta el dominio; nunca conoce la infraestructura.
            { from: ['application'], allow: ['domain', 'application', 'shared-domain'] },

            // La infraestructura es la única que puede verlo todo.
            {
              from: ['infrastructure'],
              allow: [
                'domain',
                'application',
                'infrastructure',
                'shared-domain',
                'shared-infra',
              ],
            },
            { from: ['shared-infra'], allow: ['shared-domain', 'shared-infra'] },
            {
              from: ['app-root'],
              allow: ['app-root', 'application', 'infrastructure', 'shared-domain', 'shared-infra'],
            },
          ],
        },
      ],

      // Esta es la que hace cumplir el DoD de la Fase 3: cero dependencias de
      // Prisma, Nest o Zod dentro de `domain/`. Sin ella, la regla anterior
      // solo cubre los imports internos.
      'boundaries/external': [
        'error',
        {
          default: 'allow',
          rules: [
            {
              from: ['domain', 'shared-domain'],
              disallow: [
                '@prisma/client',
                'prisma',
                '@nestjs/*',
                'zod',
                'express',
                '@supabase/*',
              ],
              message:
                'El dominio no puede depender de ${dependency}. ' +
                'Define un puerto en domain/ y su adaptador en infrastructure/.',
            },
          ],
        },
      ],
    },
  },

  // Los tests pueden saltarse la regla: montan dobles de puertos y adaptadores.
  {
    files: ['apps/api/src/**/*.spec.ts', 'apps/api/test/**/*.ts'],
    rules: {
      'boundaries/element-types': 'off',
      'boundaries/external': 'off',
    },
  },
];
