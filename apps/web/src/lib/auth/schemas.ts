/**
 * Esquemas Zod de los formularios de autenticación.
 *
 * Viven aparte de los componentes porque el mismo esquema valida en el cliente
 * (react-hook-form) y podría validarse en una Server Action. Es la convención
 * del proyecto: un esquema, dos sitios (CLAUDE.md §3).
 *
 * Los mensajes están en español y en segunda persona porque los lee el usuario
 * final tal cual, debajo del campo.
 */
import { z } from 'zod';

/**
 * 8 caracteres es el mínimo que exige Supabase Auth por defecto. Se repite aquí
 * para dar el error antes de la ida y vuelta a la red, no para relajarlo: si se
 * sube en el dashboard, hay que subirlo también aquí.
 */
const contrasena = z.string().min(8, 'La contraseña debe tener al menos 8 caracteres');

const correo = z.string().min(1, 'Escribe tu correo').email('Ese correo no parece válido');

export const loginSchema = z.object({
  email: correo,
  // En el login NO se valida la longitud: una contraseña antigua más corta
  // seguiría siendo válida, y rechazarla en el cliente dejaría al usuario
  // fuera de su propia cuenta sin explicación.
  password: z.string().min(1, 'Escribe tu contraseña'),
});

export const registroSchema = z
  .object({
    email: correo,
    password: contrasena,
    confirmacion: z.string().min(1, 'Repite la contraseña'),
  })
  .refine(datos => datos.password === datos.confirmacion, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmacion'],
  });

export const recuperarSchema = z.object({ email: correo });

export const restablecerSchema = z
  .object({
    password: contrasena,
    confirmacion: z.string().min(1, 'Repite la contraseña'),
  })
  .refine(datos => datos.password === datos.confirmacion, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmacion'],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type RegistroInput = z.infer<typeof registroSchema>;
export type RecuperarInput = z.infer<typeof recuperarSchema>;
export type RestablecerInput = z.infer<typeof restablecerSchema>;
