'use client';

/**
 * Primitivas compartidas por las cuatro pantallas de autenticación.
 *
 * Son deliberadamente básicas (la Fase 6 pide "funcionales, sin pulir"): el
 * sistema de diseño con shadcn/ui llega en la Fase 8. Lo que sí está resuelto
 * aquí y no conviene perder al rehacerlas es la **accesibilidad**: cada campo
 * lleva su `<label>` asociada, el error se anuncia con `aria-describedby` y
 * `role="alert"`, y `aria-invalid` marca el campo. Un formulario de login sin
 * eso es inusable con lector de pantalla y con el autocompletado del navegador.
 */
import React from 'react';

export function Campo({
  id,
  etiqueta,
  error,
  children,
}: {
  id: string;
  etiqueta: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {etiqueta}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const Entrada = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { error?: string }
>(function Entrada({ error, className = '', ...props }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${props.id}-error` : undefined}
      className={
        // El fondo y el color van explícitos: heredar el del navegador es lo
        // que pintaba los campos en oscuro dentro de una tarjeta blanca.
        'rounded-md border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition ' +
        'focus:ring-2 focus:ring-slate-900/10 ' +
        (error ? 'border-red-500' : 'border-slate-300 focus:border-slate-500') +
        (className ? ` ${className}` : '')
      }
      {...props}
    />
  );
});

export function Boton({
  cargando,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { cargando?: boolean }) {
  return (
    <button
      // `disabled` mientras se envía evita el doble submit, que en el registro
      // se traduce en dos correos de confirmación.
      disabled={cargando || props.disabled}
      className="mt-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      {...props}
    >
      {cargando ? 'Un momento…' : children}
    </button>
  );
}

/** Error o confirmación de toda la operación, no de un campo concreto. */
export function Aviso({ tipo, children }: { tipo: 'error' | 'exito'; children: React.ReactNode }) {
  const estilo =
    tipo === 'error'
      ? 'border-red-200 bg-red-50 text-red-800'
      : 'border-emerald-200 bg-emerald-50 text-emerald-800';

  return (
    <p role="alert" className={`rounded-md border px-3 py-2 text-sm ${estilo}`}>
      {children}
    </p>
  );
}

export function TarjetaAuth({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-slate-900">{titulo}</h1>
        <p className="mb-6 text-sm text-slate-500">SICFI · control de gastos por quincenas</p>
        {children}
      </div>
    </main>
  );
}
