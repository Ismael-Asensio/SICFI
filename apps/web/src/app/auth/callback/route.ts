/**
 * Canje del código de los enlaces por correo (confirmación y recuperación).
 *
 * Supabase manda al usuario aquí con `?code=…`. `exchangeCodeForSession` lo
 * cambia por una sesión y deja las cookies puestas — por eso esto es un Route
 * Handler y no un Server Component: ahí sí se pueden escribir cookies.
 *
 * Tiene que ser público en el middleware: quien llega todavía no tiene sesión;
 * el propósito de la ruta es dársela.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { createSupabaseServerClient } from '../../../lib/supabase/server-client';

/** Igual que en el login: solo destinos relativos, o esto es un open redirect. */
function destinoSeguro(siguiente: string | null): string {
  if (!siguiente) return '/panel';
  if (!siguiente.startsWith('/') || siguiente.startsWith('//')) return '/panel';
  return siguiente;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const destino = destinoSeguro(searchParams.get('siguiente'));

  // Supabase informa de los fallos por query string, no con un status de error.
  const errorDescripcion = searchParams.get('error_description');
  if (errorDescripcion || !code) {
    const login = new URL('/login', origin);
    login.searchParams.set('error', 'enlace');
    return NextResponse.redirect(login);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const recuperar = new URL('/recuperar', origin);
    recuperar.searchParams.set('error', 'caducado');
    return NextResponse.redirect(recuperar);
  }

  return NextResponse.redirect(new URL(destino, origin));
}
