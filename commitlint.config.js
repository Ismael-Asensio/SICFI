module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'chore', 'ci', 'revert'],
    ],
    'scope-enum': [
      2,
      'always',
      ['iam', 'catalog', 'budget', 'recurring', 'ledger', 'analytics', 'web', 'infra', 'fase-0', 'fase-1', 'fase-2', 'fase-3', 'fase-4', 'fase-5', 'fase-6', 'fase-7', 'fase-8', 'fase-9', 'fase-10', 'fase-11', 'fase-12', 'fase-13', 'fase-14', 'fase-15'],
    ],
    'subject-case': [2, 'never', ['start-case', 'pascal-case']],
  },
};
