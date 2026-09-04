import { randomUUID } from 'node:crypto';

import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service';

import { bearerFor, createE2eApp } from './support/e2e-app';

/**
 * Rate limiting (Fase 6).
 *
 * El test que de verdad importa es el segundo: **dos usuarios distintos no
 * comparten cupo**. Corriendo en local ambos salen por `::ffff:127.0.0.1`, así
 * que si el contador fuera por IP —el comportamiento de serie de
 * `ThrottlerGuard`— el segundo usuario heredaría el cupo gastado por el primero
 * y recibiría un 429 sin haber hecho nada. Que no ocurra es la prueba de que
 * `UserAwareThrottlerGuard` está keyeando por el `sub` del JWT.
 *
 * Y eso solo funciona si el guard corre DESPUÉS de `JwtAuthGuard`, porque
 * `request.sicfiAuth` no existe antes. Este spec cubre ese orden.
 */
describe('Rate limiting por usuario (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: ReturnType<INestApplication['getHttpServer']>;

  const creados: string[] = [];

  const nuevoUsuario = () => ({ id: randomUUID(), email: `thr-${randomUUID()}@e2e.test` });

  beforeAll(async () => {
    app = await createE2eApp();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
  }, 120_000);

  afterAll(async () => {
    for (const userId of creados) {
      const memberships = await prisma.householdMember.findMany({ where: { userId } });
      for (const m of memberships) {
        await prisma.household.delete({ where: { id: m.householdId } }).catch(() => undefined);
      }
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    await app.close();
  }, 120_000);

  it('agota el cupo de /auth/bootstrap y responde 429', async () => {
    const user = nuevoUsuario();
    creados.push(user.id);

    // El límite de la ruta es 5/min. La primera llamada da de alta al usuario;
    // las siguientes son idempotentes y baratas.
    const codigos: number[] = [];
    for (let i = 0; i < 7; i += 1) {
      const response = await request(server)
        .post('/api/v1/auth/bootstrap')
        .set('Authorization', bearerFor(user.id, user.email))
        .send({ householdName: '__e2e__ throttle' });
      codigos.push(response.status);
    }

    expect(codigos.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(codigos.slice(5)).toEqual([429, 429]);
  }, 180_000);

  it('el cupo es POR USUARIO: agotar el de uno no afecta al otro', async () => {
    const quemado = nuevoUsuario();
    const inocente = nuevoUsuario();
    creados.push(quemado.id, inocente.id);

    for (let i = 0; i < 6; i += 1) {
      await request(server)
        .post('/api/v1/auth/bootstrap')
        .set('Authorization', bearerFor(quemado.id, quemado.email))
        .send({ householdName: '__e2e__ throttle quemado' });
    }

    // Confirmamos que el primero está efectivamente bloqueado…
    await request(server)
      .post('/api/v1/auth/bootstrap')
      .set('Authorization', bearerFor(quemado.id, quemado.email))
      .send({ householdName: '__e2e__ throttle quemado' })
      .expect(429);

    // …y que el segundo, desde la MISMA IP, entra sin problema.
    await request(server)
      .post('/api/v1/auth/bootstrap')
      .set('Authorization', bearerFor(inocente.id, inocente.email))
      .send({ householdName: '__e2e__ throttle inocente' })
      .expect(200);
  }, 180_000);
});
