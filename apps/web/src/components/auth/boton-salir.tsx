'use client';

import { useRouter } from 'next/navigation';
import React from 'react';

import { getSupabaseBrowserClient } from '../../lib/supabase/browser-client';

export function BotonSalir() {
  const router = useRouter();
  const [saliendo, setSaliendo] = React.useState(false);

  const salir = async () => {
    setSaliendo(true);
    await getSupabaseBrowserClient().auth.signOut();
    // `refresh()` invalida la caché del Router: sin él, el panel ya renderizado
    // seguiría en memoria y volvería a verse al pulsar "atrás".
    router.refresh();
    router.replace('/login');
  };

  return (
    <button
      onClick={salir}
      disabled={saliendo}
      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
    >
      {saliendo ? 'Saliendo…' : 'Salir'}
    </button>
  );
}
