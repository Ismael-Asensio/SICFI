'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import React from 'react';
import { useForm } from 'react-hook-form';

import { Aviso, Boton, Campo, Entrada, TarjetaAuth } from '../../../components/auth/campos';
import { traducirErrorAuth } from '../../../lib/auth/errores';
import { recuperarSchema, type RecuperarInput } from '../../../lib/auth/schemas';
import { getSupabaseBrowserClient } from '../../../lib/supabase/browser-client';

export default function RecuperarPage() {
  const [errorGeneral, setErrorGeneral] = React.useState<string | null>(null);
  const [enviado, setEnviado] = React.useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RecuperarInput>({ resolver: zodResolver(recuperarSchema) });

  const enviar = handleSubmit(async ({ email }) => {
    setErrorGeneral(null);

    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?siguiente=/restablecer`,
    });

    // Solo se corta ante errores de transporte o de cupo. Que el correo exista
    // o no NO cambia la respuesta: ver el comentario de abajo.
    if (error) {
      setErrorGeneral(traducirErrorAuth(error.message));
      return;
    }

    setEnviado(true);
  });

  if (enviado) {
    return (
      <TarjetaAuth titulo="Revisa tu correo">
        {/*
          El mensaje es deliberadamente ambiguo: "si existe una cuenta". Confirmar
          que el correo está registrado convertiría esta pantalla en un buscador
          de usuarios —se prueban direcciones y se ve cuáles responden distinto—.
        */}
        <Aviso tipo="exito">
          Si existe una cuenta con ese correo, te enviamos un enlace para cambiar la contraseña.
        </Aviso>
        <p className="mt-4 text-sm text-slate-600">El enlace caduca en una hora.</p>
        <Link href="/login" className="mt-4 inline-block text-sm underline hover:text-slate-900">
          Volver a entrar
        </Link>
      </TarjetaAuth>
    );
  }

  return (
    <TarjetaAuth titulo="Recuperar contraseña">
      <p className="mb-4 text-sm text-slate-600">
        Escribe tu correo y te enviamos un enlace para elegir una contraseña nueva.
      </p>

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

        <Boton type="submit" cargando={isSubmitting}>
          Enviar enlace
        </Boton>
      </form>

      <Link href="/login" className="mt-6 inline-block text-sm underline hover:text-slate-900">
        Volver a entrar
      </Link>
    </TarjetaAuth>
  );
}
