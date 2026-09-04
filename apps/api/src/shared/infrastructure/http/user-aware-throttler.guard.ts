/**
 * Rate limiting consciente del usuario.
 *
 * El `ThrottlerGuard` de serie cuenta **por IP**. Detrás de un proxy —y en
 * Vercel siempre lo estamos— eso tiene dos fallos simétricos:
 *
 *   · **Falsos positivos:** una oficina o una operadora móvil salen por una
 *     sola IP. Un usuario legítimo se come el cupo de sus vecinos.
 *   · **Falsos negativos:** quien quiera abusar rota IPs y el límite no existe.
 *
 * Para rutas autenticadas hay un identificador mucho mejor: el `sub` del JWT,
 * que ya resolvió `JwtAuthGuard`. Es estable, no se puede rotar sin registrarse
 * de nuevo, y es exactamente el sujeto al que queremos limitar.
 *
 * Se cae a la IP solo cuando no hay usuario (rutas `@Public()`).
 *
 * ── Limitación conocida, y por qué se acepta ─────────────────────────────
 * El almacenamiento por defecto es en memoria del proceso. En serverless cada
 * instancia lleva su propia cuenta, así que el límite efectivo es
 * `limit × instancias` en el peor caso. Degrada la protección, no la anula:
 * sigue frenando el abuso desde un cliente, que es el escenario que importa
 * aquí. Si algún día hace falta un límite duro, se cambia el storage a Redis
 * sin tocar los decoradores de las rutas.
 */
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

import type { AuthenticatedRequestContext } from './auth.decorators';

interface RequestWithAuth {
  sicfiAuth?: AuthenticatedRequestContext;
  ip?: string;
  ips?: string[];
}

@Injectable()
export class UserAwareThrottlerGuard extends ThrottlerGuard {
  protected getTracker(request: RequestWithAuth): Promise<string> {
    const userId = request.sicfiAuth?.userId;
    if (userId) return Promise.resolve(`user:${userId}`);

    // `ips` viene poblado cuando Express confía en el proxy; el primer elemento
    // es el cliente original. Si no, `ip` a secas.
    const ip = request.ips?.length ? request.ips[0] : request.ip;
    return Promise.resolve(`ip:${ip ?? 'desconocida'}`);
  }
}
