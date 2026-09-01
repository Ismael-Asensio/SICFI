module.exports = {
  root: true,
  extends: ['@sicfi/config-eslint'],
  parserOptions: {
    project: ['./tsconfig.json', './apps/*/tsconfig.json', './packages/*/tsconfig.json'],
  },
  overrides: [
    {
      files: ['apps/api/src/**/*'],
      settings: {
        'boundaries/elements': [
          { type: 'domain', pattern: 'src/contexts/*/domain/**' },
          { type: 'application', pattern: 'src/contexts/*/application/**' },
          { type: 'infrastructure', pattern: 'src/contexts/*/infrastructure/**' },
          { type: 'shared', pattern: 'src/shared/**' },
        ],
        'boundaries/ignore': ['**/*.spec.ts', '**/*.test.ts'],
      },
      rules: {
        'boundaries/no-unknown': 'error',
        'boundaries/no-crossing': [
          'error',
          {
            default: 'disallow',
            rules: [
              {
                from: ['domain'],
                to: ['application', 'infrastructure', 'shared'],
                disallow: true,
              },
              {
                from: ['application'],
                to: ['infrastructure'],
                allow: true,
              },
            ],
          },
        ],
      },
    },
  ],
};
