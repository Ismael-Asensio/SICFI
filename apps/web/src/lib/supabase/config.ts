/**
 * Configuración pública de Supabase.
 *
 * Solo entran aquí las dos variables que **pueden** viajar al navegador: la URL
 * del proyecto y la clave publishable (la antigua `anon`). Ambas son públicas
 * por diseño: lo que decide qué puede hacer un usuario es su JWT y las
 * políticas RLS, no el secreto de la clave.
 *
 * La `SUPABASE_SECRET_KEY` (service_role) **no aparece en este paquete ni debe
 * aparecer nunca**. Salta RLS por completo; en el cliente equivaldría a
 * publicar la base entera. El backend tampoco la necesita: verifica los JWT
 * contra el JWKS público.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}. ` +
        'Cópiala de apps/web/.env.local.example a apps/web/.env.local.'
    );
  }
  return value;
}

export const SUPABASE_URL = required(
  'NEXT_PUBLIC_SUPABASE_URL',
  process.env.NEXT_PUBLIC_SUPABASE_URL
);

export const SUPABASE_PUBLISHABLE_KEY = required(
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);
