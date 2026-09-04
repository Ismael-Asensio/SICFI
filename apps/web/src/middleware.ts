/**
 * Middleware de sesión y protección de rutas (Fase 6).
 *
 * Hace dos cosas, y el orden importa:
 *   1. **Refresca la sesión** en TODA navegación (`updateSession`). Es lo que
 *      mantiene vivo el access token, que caduca a la hora.
 *   2. **Decide el acceso** según el grupo de rutas.
 *
 * ── Por qué la lista es de rutas públicas y no de rutas protegidas ───────
 * Todo lo que no esté explícitamente abierto queda cerrado. Si mañana alguien
 * añade `/movimientos` y se olvida de tocar este archivo, la ruta pide sesión;
 * al revés, se habría publicado sin querer. Es la misma decisión que en el
 * backend con `JwtAuthGuard` global: el olvido tiene que fallar hacia el lado
 * seguro.
 *
 * Este middleware **no es la barrera de seguridad de los datos**. Esa está en
 * el backend: `JwtAuthGuard` + la extensión de tenant de Prisma. Aquí solo se
 * decide qué pantalla ve el navegador. Nada que llegue a la API se autoriza en
 * función de esto.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { updateSession } from './lib/supabase/middleware-client';

/** Accesibles sin sesión. */
const RUTAS_PUBLICAS = ['/login', '/registro', '/recuperar', '/restablecer', '/auth/callback'];

/** Con sesión iniciada, estas no tienen sentido: te mandan al panel. */
const RUTAS_SOLO_ANONIMAS = ['/login', '/registro', '/recuperar'];

function empiezaPor(pathname: string, rutas: string[]): boolean {
  return rutas.some(ruta => pathname === ruta || pathname.startsWith(`${ruta}/`));
}

export async function middleware(request: NextRequest) {
  const { response, userId } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  if (!userId && !empiezaPor(pathname, RUTAS_PUBLICAS)) {
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.search = '';
    // Para devolverlo a donde iba después de entrar. Se guarda solo la ruta
    // relativa: aceptar una URL absoluta aquí sería un open redirect.
    if (pathname !== '/') login.searchParams.set('siguiente', `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  if (userId && empiezaPor(pathname, RUTAS_SOLO_ANONIMAS)) {
    const panel = request.nextUrl.clone();
    panel.pathname = '/panel';
    panel.search = '';
    return NextResponse.redirect(panel);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Todo menos los estáticos y los iconos. `_next/static` y `_next/image` los
     * sirve Next sin sesión, y hacerles pasar por `getUser()` añadiría una
     * llamada de red a cada chunk.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
