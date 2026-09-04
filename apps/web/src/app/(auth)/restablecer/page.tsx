'use client';

/**
 * Elegir contraseña nueva tras seguir el enlace del correo.
 *
 * Se llega aquí **ya autenticado**: `/auth/callback` canjeó el código del
 * enlace por una sesión. Por eso `updateUser` funciona sin pedir la contraseña
 * anterior — el enlace del correo ES la prueba de identidad.
 *
 * Y por eso esta ruta está en la lista de públicas del middleware pero NO en la
 * de "solo anónimas": quien llega tiene sesión, y mandarlo al panel por tenerla
 * le impediría justamente lo que vino a hacer.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React from 'react';
import { useForm } from 'react-hook-form';

import { Aviso, Boton, Campo, Entrada, TarjetaAuth } from '../../../components/auth/campos';
import { traducirErrorAuth } from '../../../lib/auth/errores';
import { restablecerSchema, type RestablecerInput } from '../../../lib/auth/schemas';
import { getSupabaseBrowserClient } from '../../../lib/supabase/browser-client';

export default function RestablecerPage() {
  const router = useRouter();
  const [errorGeneral, setErrorGeneral] = React.useState<string | null>(null);
  const [sesionValida, setSesionValida] = React.useState<boolean | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RestablecerInput>({ resolver: zodResolver(restablecerSchema) });

  // Sin sesión no hay nada que actualizar: pasa si el enlace caducó o si
  // alguien entra a /restablecer a pelo. Mejor decirlo que enseñar un
  // formulario que fallará al enviarse.
  React.useEffect(() => {
    let vigente = true;

    void (async () => {
      const { data, error } = await getSupabaseBrowserClient().auth.getUser();
      // El usuario pudo salir de la pantalla mientras se resolvía: escribir
      // estado en un componente ya desmontado no rompe nada, pero avisa por
      // consola y esconde fugas reales entre el ruido.
      if (vigente) setSesionValida(!error && data.user !== null);
    })();

    return () => {
      vigente = false;
    };
  }, []);

  const enviar = handleSubmit(async ({ password }) => {
    setErrorGeneral(null);

    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setErrorGeneral(traducirErrorAuth(error.message));
      return;
    }

    // Se cierra la sesión a propósito: el enlace de recuperación pudo pasar por
    // el correo de un tercero, así que se obliga a entrar con la contraseña
    // nueva. Además invalida la sesión abierta por el propio enlace.
    await supabase.auth.signOut();
    router.refresh();
    router.replace('/login?contrasena=ok');
  });

  if (sesionValida === false) {
    return (
      <TarjetaAuth titulo="Enlace no válido">
        <Aviso tipo="error">
          Este enlace ya caducó o no es válido. Pide uno nuevo para cambiar la contraseña.
        </Aviso>
        <Link
          href="/recuperar"
          className="mt-4 inline-block text-sm underline hover:text-slate-900"
        >
          Pedir un enlace nuevo
        </Link>
      </TarjetaAuth>
    );
  }

  return (
    <TarjetaAuth titulo="Nueva contraseña">
      <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
        {errorGeneral ? <Aviso tipo="error">{errorGeneral}</Aviso> : null}

        <Campo id="password" etiqueta="Contraseña nueva" error={errors.password?.message}>
          <Entrada
            id="password"
            type="password"
            autoComplete="new-password"
            autoFocus
            error={errors.password?.message}
            {...register('password')}
          />
        </Campo>

        <Campo id="confirmacion" etiqueta="Repítela" error={errors.confirmacion?.message}>
          <Entrada
            id="confirmacion"
            type="password"
            autoComplete="new-password"
            error={errors.confirmacion?.message}
            {...register('confirmacion')}
          />
        </Campo>

        <Boton type="submit" cargando={isSubmitting || sesionValida === null}>
          Guardar contraseña
        </Boton>
      </form>
    </TarjetaAuth>
  );
}
