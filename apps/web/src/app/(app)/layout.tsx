/**
 * Shell de la zona privada.
 *
 * El middleware ya redirige a `/login` sin sesión, así que esta comprobación es
 * **redundante a propósito**: el middleware no corre en todos los caminos (una
 * navegación de cliente entre rutas ya prerenderizadas puede saltárselo), y
 * confiar en una sola capa para decidir quién ve qué es exactamente el error
 * que se paga caro. Es el mismo criterio que en el backend: guard + extensión
 * de tenant + RLS.
 *
 * Aun así, ninguna de las dos es la barrera de los DATOS: eso lo decide la API,
 * que exige el JWT en cada llamada.
 */
import { redirect } from 'next/navigation';
import React from 'react';

import { BotonSalir } from '../../components/auth/boton-salir';
import { getCurrentUser } from '../../lib/supabase/server-client';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <span className="font-semibold text-slate-900">SICFI</span>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-slate-500 sm:inline">{user.email}</span>
            <BotonSalir />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
