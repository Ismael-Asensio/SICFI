/**
 * Refresco de sesión en el middleware.
 *
 * Es la pieza que mantiene viva la sesión: el access token de Supabase dura una
 * hora, y quien lo rota es esta llamada a `getUser()` en cada navegación. Sin
 * ella, el usuario se quedaría fuera al cabo de una hora aunque estuviera
 * usando la app.
 *
 * ── El detalle que rompe todo si se hace mal ─────────────────────────────
 * Cuando Supabase rota el token hay que escribir las cookies nuevas **en la
 * petición y en la respuesta**:
 *   · en la petición, para que lo que se renderice a continuación en esta misma
 *     pasada vea la sesión ya renovada;
 *   · en la respuesta, para que el navegador se quede con las cookies nuevas.
 * Escribir solo una de las dos da el clásico "se cierra la sesión sola": el
 * token viejo sigue en el navegador y cada navegación vuelve a intentar rotarlo.
 *
 * Por eso `NextResponse.next()` se reconstruye con la petición ya actualizada,
 * en vez de reutilizar la respuesta creada antes.
 */
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config';

export async function updateSession(request: NextRequest): Promise<{
  response: NextResponse;
  userId: string | null;
}> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: cookiesToSet => {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // `getUser()` y no `getSession()`: valida el token contra Supabase Auth en
  // vez de creerse la cookie. Y esta llamada es la que dispara la rotación.
  const { data, error } = await supabase.auth.getUser();

  return { response, userId: error ? null : (data.user?.id ?? null) };
}
