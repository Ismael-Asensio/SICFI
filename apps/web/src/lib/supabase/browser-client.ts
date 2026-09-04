'use client';

/**
 * Cliente de Supabase para el navegador.
 *
 * `createBrowserClient` de `@supabase/ssr` guarda la sesión en **cookies**, no
 * en `localStorage` (CLAUDE.md §3). Esa es toda la razón de usar este paquete y
 * no `createClient` de `supabase-js` a secas: las cookies viajan solas en cada
 * petición, así que el middleware y los Server Components ven la misma sesión
 * que el navegador. Con `localStorage` el servidor no vería nada y habría que
 * renderizar toda la app en cliente.
 *
 * Se memoiza: cada instancia abre su propio canal de refresco de token, y
 * varias a la vez se pisan intentando rotar el mismo refresh token.
 */
import { createBrowserClient } from '@supabase/ssr';

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config';

type BrowserClient = ReturnType<typeof createBrowserClient>;

let cached: BrowserClient | undefined;

export function getSupabaseBrowserClient(): BrowserClient {
  cached ??= createBrowserClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  return cached;
}
