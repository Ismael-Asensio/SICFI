/**
 * Traducción de los errores de Supabase Auth a mensajes en español.
 *
 * Supabase responde en inglés y con textos pensados para desarrolladores
 * ("Invalid login credentials"). Aquí se convierten en algo que el usuario
 * pueda leer.
 *
 * ── Lo que NO se hace, a propósito ───────────────────────────────────────
 * No se distingue "ese correo no existe" de "la contraseña es incorrecta".
 * Supabase ya devuelve el mismo error para ambos, y está bien: separarlos
 * convertiría el login en un oráculo para averiguar qué correos tienen cuenta.
 * El mensaje ambiguo es la decisión correcta, no una carencia.
 */
const TRADUCCIONES: ReadonlyArray<readonly [RegExp, string]> = [
  [/invalid login credentials/i, 'Correo o contraseña incorrectos.'],
  [
    /email not confirmed/i,
    'Todavía no has confirmado tu correo. Revisa la bandeja de entrada (y el spam).',
  ],
  [/user already registered|already been registered/i, 'Ya existe una cuenta con ese correo.'],
  [
    /password should be at least/i,
    'La contraseña es demasiado corta: necesita al menos 8 caracteres.',
  ],
  [
    /for security purposes|rate limit|too many requests/i,
    'Demasiados intentos seguidos. Espera un minuto y vuelve a probar.',
  ],
  [
    /token has expired|invalid or has expired/i,
    'Este enlace ya caducó. Pide uno nuevo desde "¿Olvidaste tu contraseña?".',
  ],
  [/same password/i, 'La contraseña nueva tiene que ser distinta de la anterior.'],
  [/email address .* is invalid|unable to validate email/i, 'Ese correo no parece válido.'],
  [/failed to fetch|network/i, 'No se pudo conectar. Comprueba tu conexión e inténtalo de nuevo.'],
];

export function traducirErrorAuth(mensaje: string | undefined): string {
  if (!mensaje) return 'Algo salió mal. Vuelve a intentarlo.';

  for (const [patron, traduccion] of TRADUCCIONES) {
    if (patron.test(mensaje)) return traduccion;
  }

  // Sin traducción: mejor un texto genérico que uno en inglés a medio camino.
  return 'No se pudo completar la operación. Vuelve a intentarlo.';
}
