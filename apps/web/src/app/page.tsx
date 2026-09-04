import { redirect } from 'next/navigation';

/**
 * La raíz no tiene contenido propio: reparte según haya sesión o no. El
 * middleware ya habría mandado a `/login` a quien no la tenga, así que en la
 * práctica esto lleva al panel.
 */
export default function Home() {
  redirect('/panel');
}
