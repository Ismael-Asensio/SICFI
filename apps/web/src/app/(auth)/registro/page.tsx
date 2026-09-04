'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React from 'react';
import { useForm } from 'react-hook-form';

import { Aviso, Boton, Campo, Entrada, TarjetaAuth } from '../../../components/auth/campos';
import { traducirErrorAuth } from '../../../lib/auth/errores';
import { registroSchema, type RegistroInput } from '../../../lib/auth/schemas';
import { getSupabaseBrowserClient } from '../../../lib/supabase/browser-client';

export default function RegistroPage() {
  const router = useRouter();
  const [errorGeneral, setErrorGeneral] = React.useState<string | null>(null);
  const [pendienteConfirmar, setPendienteConfirmar] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegistroInput>({ resolver: zodResolver(registroSchema) });

  const enviar = handleSubmit(async ({ email, password }) => {
    setErrorGeneral(null);

    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (error) {
      setErrorGeneral(traducirErrorAuth(error.message));
      return;
    }

    // Con la confirmación por correo activada, `signUp` NO devuelve sesión: el
    // usuario existe pero no puede entrar hasta pulsar el enlace. Hay que
    // distinguir los dos casos o la pantalla se queda muerta sin explicar nada.
    if (data.session) {
      router.refresh();
      router.replace('/panel');
      return;
    }

    setPendienteConfirmar(true);
  });

  if (pendienteConfirmar) {
    return (
      <TarjetaAuth titulo="Revisa tu correo">
        <Aviso tipo="exito">
          Te enviamos un enlace de confirmación. Ábrelo para activar la cuenta y luego entra con tu
          contraseña.
        </Aviso>
        <p className="mt-4 text-sm text-slate-600">
          ¿No llegó? Mira en la carpeta de spam antes de volver a registrarte.
        </p>
        <Link href="/login" className="mt-4 inline-block text-sm underline hover:text-slate-900">
          Volver a entrar
        </Link>
      </TarjetaAuth>
    );
  }

  return (
    <TarjetaAuth titulo="Crear cuenta">
      <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
        {errorGeneral ? <Aviso tipo="error">{errorGeneral}</Aviso> : null}

        <Campo id="email" etiqueta="Correo" error={errors.email?.message}>
          <Entrada
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            error={errors.email?.message}
            {...register('email')}
          />
        </Campo>

        <Campo id="password" etiqueta="Contraseña" error={errors.password?.message}>
          <Entrada
            id="password"
            type="password"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register('password')}
          />
        </Campo>

        <Campo
          id="confirmacion"
          etiqueta="Repite la contraseña"
          error={errors.confirmacion?.message}
        >
          <Entrada
            id="confirmacion"
            type="password"
            autoComplete="new-password"
            error={errors.confirmacion?.message}
            {...register('confirmacion')}
          />
        </Campo>

        <Boton type="submit" cargando={isSubmitting}>
          Crear cuenta
        </Boton>
      </form>

      <p className="mt-6 text-sm text-slate-600">
        ¿Ya tienes cuenta?{' '}
        <Link href="/login" className="underline hover:text-slate-900">
          Entrar
        </Link>
      </p>
    </TarjetaAuth>
  );
}
