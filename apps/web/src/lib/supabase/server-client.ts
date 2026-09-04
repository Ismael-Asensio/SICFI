import 'server-only';

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers.
 *
 * El `try/catch` alrededor de `set` no es descuido: en un **Server Component**
 * las cookies son de solo lectura y `cookies().set()` lanza. Solo se pueden
 * escribir desde una Server Action o un Route Handler. Como el mismo cliente
 * sirve para los tres casos, se traga el error cuando no se puede escribir.
 *
 * Que eso sea seguro depende de una condición: que el **middleware** refresque
 * la sesión en cada navegación. Ahí sí se pueden escribir cookies, y es donde
 * de verdad se renueva el token. Este catch solo cubre el caso en que un
 * Server Component intente reescribir una cookie que el middleware ya dejó al
 * día. Si se quita el middleware, las sesiones dejan de refrescarse y el
 * usuario se ve expulsado al caducar el access token.
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config';

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: cookiesToSet => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component: el middleware ya se encargó. Ver cabecera.
        }
      },
    },
  });
}

/**
 * El usuario de la petición actual, o `null`.
 *
 * Usa **`getUser()`, nunca `getSession()`**. `getSession()` devuelve lo que
 * venga en la cookie sin comprobar la firma: en el servidor eso es confiar en
 * un dato que manda el cliente. `getUser()` lo valida contra Supabase Auth.
 */
export async function getCurrentUser() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  return error ? null : data.user;
}
