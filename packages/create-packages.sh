# packages/contracts
mkdir -p contracts/src
cd contracts

cat > package.json <<'PKGJSON'
{
  "name": "@sicfi/contracts",
  "version": "0.0.1",
  "description": "Shared types and Zod schemas",
  "private": true,
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "lint": "eslint src --ext .ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "@typescript-eslint/eslint-plugin": "^8.20.0",
    "@typescript-eslint/parser": "^8.20.0",
    "eslint": "^9.20.0"
  }
}
PKGJSON

cat > tsconfig.json <<'TSJSON'
{
  "extends": "../config-typescript/tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
TSJSON

cat > src/index.ts <<'INDEX'
// TODO: Add shared types and Zod schemas
export const API_PREFIX = '/api/v1';
INDEX

cd ..

# packages/config-eslint
mkdir -p config-eslint
cd config-eslint

cat > package.json <<'PKGJSON'
{
  "name": "@sicfi/config-eslint",
  "version": "0.0.1",
  "description": "ESLint config with boundaries",
  "private": true,
  "main": "index.js",
  "dependencies": {
    "eslint": "^9.20.0",
    "@typescript-eslint/eslint-plugin": "^8.20.0",
    "@typescript-eslint/parser": "^8.20.0",
    "eslint-plugin-boundaries": "^1.1.1",
    "eslint-plugin-import": "^2.31.0",
    "eslint-plugin-react": "^7.37.2"
  }
}
PKGJSON

cat > index.js <<'ESLINT'
module.exports = {
  env: {
    node: true,
    es2022: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/strict-type-checked',
  ],
  plugins: ['@typescript-eslint', 'boundaries', 'import'],
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    'boundaries/no-unknown': 'error',
    'boundaries/no-crossing': 'error',
    'import/order': [
      'warn',
      {
        groups: [
          'builtin',
          'external',
          'internal',
          'parent',
          'sibling',
          'index',
        ],
        alphabeticalOrder: true,
      },
    ],
  },
};
ESLINT

cd ..

# packages/config-typescript
mkdir -p config-typescript
cd config-typescript

cat > package.json <<'PKGJSON'
{
  "name": "@sicfi/config-typescript",
  "version": "0.0.1",
  "description": "Shared TypeScript config",
  "private": true
}
PKGJSON

cat > tsconfig.json <<'TSJSON'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true
  }
}
TSJSON

cd ..
echo "Packages created"
