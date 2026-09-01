mkdir -p web/{src/app,public}

cd web

cat > package.json <<'WEBJSON'
{
  "name": "@sicfi/web",
  "version": "0.0.1",
  "description": "SICFI Frontend (Next.js)",
  "author": "Ismael Asensio",
  "private": true,
  "engines": {
    "node": ">=22.0.0"
  },
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "lint": "eslint src --ext .ts,.tsx",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "next": "^15.1.6",
    "@tanstack/react-query": "^5.62.13",
    "react-hook-form": "^7.54.0",
    "zod": "^3.24.1",
    "zustand": "^5.0.2",
    "clsx": "^2.1.1",
    "tailwindcss": "^4.0.11",
    "@radix-ui/react-dialog": "^1.1.2",
    "@radix-ui/react-slot": "^2.0.2"
  },
  "devDependencies": {
    "@types/react": "^19.0.1",
    "@types/node": "^22.10.5",
    "@types/react-dom": "^19.0.1",
    "@typescript-eslint/eslint-plugin": "^8.20.0",
    "@typescript-eslint/parser": "^8.20.0",
    "eslint": "^9.20.0",
    "eslint-plugin-react": "^7.37.2",
    "typescript": "^5.7.2",
    "postcss": "^8.4.47"
  }
}
WEBJSON

cat > tsconfig.json <<'TSJSON'
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "dom", "dom.iterable"],
    "jsx": "preserve",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
TSJSON

cat > next.config.ts <<'NEXTCFG'
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ['@radix-ui/react-dialog'],
  },
};

export default nextConfig;
NEXTCFG

cat > tailwind.config.ts <<'TAILCFG'
import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ok: {
          50: 'oklch(0.96 0.03 150)',
          500: 'oklch(0.62 0.15 150)',
        },
        warn: {
          50: 'oklch(0.97 0.04 85)',
          500: 'oklch(0.75 0.15 85)',
        },
        danger: {
          50: 'oklch(0.96 0.03 25)',
          500: 'oklch(0.58 0.20 25)',
        },
        info: {
          500: 'oklch(0.60 0.14 250)',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
TAILCFG

cat > postcss.config.mjs <<'POSTCFG'
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
POSTCFG

mkdir -p src/app
cat > src/app/layout.tsx <<'LAYOUT'
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SICFI',
  description: 'Sistema de Control Financiero Individual',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
LAYOUT

cat > src/app/page.tsx <<'PAGE'
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">SICFI</h1>
        <p className="text-gray-600">Sistema de Control Financiero Individual</p>
      </div>
    </main>
  );
}
PAGE

cat > src/app/globals.css <<'CSS'
@tailwind base;
@tailwind components;
@tailwind utilities;

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  color-scheme: light dark;
}
CSS

echo "Web structure created"
