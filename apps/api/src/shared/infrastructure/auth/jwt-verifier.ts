/**
 * Verificación del JWT de Supabase contra su JWKS.
 *
 * Supabase firma con **ES256** (clave asimétrica P-256) y publica la clave
 * pública en `/auth/v1/.well-known/jwks.json`. Verificar con JWKS —y no con un
 * secreto compartido— significa que la API **nunca necesita la clave secreta
 * del proyecto**: solo la pública, que cualquiera puede leer.
 *
 * `createRemoteJWKSet` de `jose` ya trae la caché y la rotación de claves: las
 * descarga una vez, las reutiliza, y solo vuelve a pedirlas si aparece un `kid`
 * desconocido (con su propio cooldown para que un token con `kid` inventado no
 * sirva para martillear a Supabase).
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export interface VerifiedToken {
  /** El `sub` del JWT: es el `id` de nuestro `User` (espejo de `auth.users`). */
  userId: string;
  email: string | null;
}

@Injectable()
export class JwtVerifier {
  private readonly logger = new Logger(JwtVerifier.name);
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;
  private readonly audience: string;

  constructor(config: ConfigService) {
    const jwksUrl = config.getOrThrow<string>('SUPABASE_JWKS_URL');
    this.issuer = config.getOrThrow<string>('SUPABASE_JWT_ISSUER');
    this.audience = config.get<string>('SUPABASE_JWT_AUDIENCE') ?? 'authenticated';

    this.jwks = createRemoteJWKSet(new URL(jwksUrl), {
      cacheMaxAge: 10 * 60 * 1000,
      cooldownDuration: 30 * 1000,
    });
  }

  /**
   * Devuelve el token verificado, o `null` si no es válido por cualquier
   * motivo (firma, expiración, emisor, audiencia).
   *
   * Nunca detalla POR QUÉ falló hacia fuera: distinguir "firma inválida" de
   * "token expirado" en la respuesta le da información gratis a quien esté
   * probando. El detalle se queda en el log.
   */
  async verify(token: string): Promise<VerifiedToken | null> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ['ES256', 'RS256'],
      });

      return this.toVerifiedToken(payload);
    } catch (error) {
      this.logger.debug(`JWT rechazado: ${(error as Error).message}`);
      return null;
    }
  }

  private toVerifiedToken(payload: JWTPayload): VerifiedToken | null {
    const { sub, email } = payload;
    if (typeof sub !== 'string' || sub.length === 0) return null;

    return { userId: sub, email: typeof email === 'string' ? email : null };
  }
}
