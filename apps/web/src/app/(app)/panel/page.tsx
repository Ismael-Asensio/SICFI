/**
 * Marcador de posición del panel.
 *
 * La Fase 6 solo tiene que dejar la autenticación funcionando de punta a punta;
 * el panel de verdad (métricas de la quincena, restante proyectado, alertas)
 * llega en la Fase 9. Esto existe para que haya un destino real detrás del
 * login y se pueda comprobar el ciclo completo entrar → ver → salir.
 */
export default function PanelPage() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h1 className="text-lg font-semibold text-slate-900">Sesión iniciada</h1>
      <p className="mt-2 text-sm text-slate-600">
        La autenticación ya funciona. El panel de la quincena —restante proyectado, fijos pendientes
        y alertas— se construye en la Fase 9.
      </p>
    </div>
  );
}
