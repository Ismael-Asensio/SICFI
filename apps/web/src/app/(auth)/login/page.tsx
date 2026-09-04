'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { Suspense } from 'react';
import { useForm } from 'react-hook-form';

import { Aviso, Boton, Campo, Entrada, TarjetaAuth } from '../../../components/auth/campos';
import { traducirErrorAuth } from '../../../lib/auth/errores';
import { loginSchema, type LoginInput } from '../../../lib/auth/schemas';
import { getSupabaseBrowserClient } from '../../../lib/supabase/browser-client';

/**
 * Solo se acepta un destino **relativo**. Si `?siguiente=` trajera
 * `https://otro-sitio.test`, redirigir allí tras iniciar sesión sería un open
 * redirect de manual: el enlace saldría de nuestro dominio y llevaría al
 * usuario recién autenticado a una copia del login.
 */
function destinoSeguro(siguiente: string | null): string {
  if (!siguiente) return '/panel';
  // `//evil.test` es protocol-relative: el navegador lo trata como absoluto.
  if (!siguiente.startsWith('/') || siguiente.startsWith('//')) return '/panel';
  return siguiente;
}

function FormularioLogin() {
  const router = useRouter();
  const parametros = useSearchParams();
  const [errorGeneral, setErrorGeneral] = React.useState<string | null>(null);

  const destino = destinoSeguro(parametros.get('siguiente'));
  const registroCompletado = parametros.get('registro') === 'ok';
  const contrasenaCambiada = parametros.get('contrasena') === 'ok';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const enviar = handleSubmit(async ({ email, password }) => {
    setErrorGeneral(null);

    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setErrorGeneral(traducirErrorAuth(error.message));
      return;
    }

    // `refresh()` antes de navegar: el middleware y los Server Components tienen
    // que ver la cookie de sesión recién puesta. Sin esto, la primera carga del
    // panel se renderiza todavía como anónima y rebota al login.
    router.refresh();
    router.replace(destino);
  });

  return (
    <TarjetaAuth titulo="Entrar">
      <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
        {registroCompletado ? (
          <Aviso tipo="exito">
            Cuenta creada. Confirma tu correo y luego entra con tu contraseña.
          </Aviso>
        ) : null}
        {contrasenaCambiada ? (
          <Aviso tipo="exito">Contraseña actualizada. Ya puedes entrar con la nueva.</Aviso>
        ) : null}
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
            autoComplete="current-password"
            error={errors.password?.message}
            {...register('password')}
          />
        </Campo>

        <Boton type="submit" cargando={isSubmitting}>
          Entrar
        </Boton>
      </form>

      <div className="mt-6 flex flex-col gap-2 text-sm text-slate-600">
        <Link href="/recuperar" className="underline hover:text-slate-900">
          ¿Olvidaste tu contraseña?
        </Link>
        <span>
          ¿No tienes cuenta?{' '}
          <Link href="/registro" className="underline hover:text-slate-900">
            Crear una
          </Link>
        </span>
      </div>
    </TarjetaAuth>
  );
}

export default function LoginPage() {
  // `useSearchParams` obliga a un límite de Suspense para no forzar el
  // renderizado dinámico de toda la ruta.
  return (
    <Suspense fallback={<TarjetaAuth titulo="Entrar">Cargando…</TarjetaAuth>}>
      <FormularioLogin />
    </Suspense>
  );
}
