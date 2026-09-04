/**
 * Levanta la app Nest completa —middleware, guards globales, DI real— contra
 * Postgres real, con una sola pieza sustituida: `JwtVerifier`.
 *
 * Se sustituye porque verificar firmas ES256 ya lo prueba `jose`, y depender
 * de Supabase Auth en vivo haría los tests lentos, frágiles y dependientes de
 * confirmaciones por email. Lo que interesa probar aquí es **lo nuestro**: que
 * el guard resuelve el tenant, que el aislamiento aguanta y que los roles
 * deciden. Todo lo demás del camino real (middleware, ALS, extensión de Prisma,
 * repositorios, controladores) es el de producción, sin dobles.
 *
 * La verificación real de un JWT firmado tiene su propio test en
 * `jwt-verifier.e2e.spec.ts`, con un JWKS local.
 */
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../../../src/app.module';
import {
  JwtVerifier,
  type VerifiedToken,
} from '../../../src/shared/infrastructure/auth/jwt-verifier';

/**
 * Doble del verificador: el token ES la identidad, con el formato
 * `<userId>|<email>`. Cualquier otra cosa se rechaza, igual que un JWT malo.
 */
class FakeJwtVerifier {
  verify(token: string): Promise<VerifiedToken | null> {
    const [userId, email] = token.split('|');
    if (!userId || !email) return Promise.resolve(null);
    return Promise.resolve({ userId, email });
  }
}

export function bearerFor(userId: string, email: string): string {
  return `Bearer ${userId}|${email}`;
}

export async function createE2eApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(JwtVerifier)
    .useClass(FakeJwtVerifier)
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  await app.init();
  return app;
}
