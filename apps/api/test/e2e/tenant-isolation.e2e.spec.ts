import { randomUUID } from 'node:crypto';

import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service';

import { bearerFor, createE2eApp } from './support/e2e-app';

/**
 * §7.3 del plan — **la batería bloqueante**.
 *
 * Dos partes, porque son dos fallos distintos:
 *   1. **Aislamiento**: el household B no ve ni toca nada de A.
 *   2. **Permisos por rol** (RN-43, RN-44): dentro de UN household, quién
 *      puede hacer qué.
 *
 * Sobre los códigos: pedir algo de otro household devuelve **404, no 403**.
 * Un 403 confirmaría que el recurso existe, y repitiendo con distintos ids se
 * podría enumerar lo que tiene el vecino (CLAUDE.md §7).
 */
describe('Aislamiento entre households y permisos por rol (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: ReturnType<INestApplication['getHttpServer']>;

  // Household A
  const ownerA = { id: randomUUID(), email: `owner-a-${randomUUID()}@e2e.test` };
  let householdA: string;
  let memberIdOwnerA: string;

  // Household B
  const ownerB = { id: randomUUID(), email: `owner-b-${randomUUID()}@e2e.test` };
  let householdB: string;

  // Miembros extra de A, para la batería de roles
  const viewerA = { id: randomUUID(), email: `viewer-a-${randomUUID()}@e2e.test` };
  const memberA = { id: randomUUID(), email: `member-a-${randomUUID()}@e2e.test` };
  const adminA = { id: randomUUID(), email: `admin-a-${randomUUID()}@e2e.test` };
  let memberIdViewerA: string;
  let memberIdAdminA: string;

  const auth = (user: { id: string; email: string }) => bearerFor(user.id, user.email);

  /** Da de alta un usuario con su household, por la vía real (POST /auth/bootstrap). */
  async function bootstrap(user: { id: string; email: string }, name: string): Promise<string> {
    const response = await request(server)
      .post('/api/v1/auth/bootstrap')
      .set('Authorization', auth(user))
      .send({ householdName: name })
      .expect(200);
    return response.body.householdId as string;
  }

  /** Añade a alguien al household con un rol dado (fixture, no flujo de invitación). */
  async function addMember(
    householdId: string,
    user: { id: string; email: string },
    role: 'ADMIN' | 'MEMBER' | 'VIEWER'
  ): Promise<string> {
    await prisma.user.upsert({
      where: { id: user.id },
      create: { id: user.id, email: user.email },
      update: {},
    });
    const created = await prisma.householdMember.create({
      data: { householdId, userId: user.id, role },
    });
    await prisma.profile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, displayName: user.email, activeHouseholdId: householdId },
      update: { activeHouseholdId: householdId },
    });
    return created.id;
  }

  beforeAll(async () => {
    app = await createE2eApp();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);

    householdA = await bootstrap(ownerA, '__e2e__ household A');
    householdB = await bootstrap(ownerB, '__e2e__ household B');

    memberIdViewerA = await addMember(householdA, viewerA, 'VIEWER');
    await addMember(householdA, memberA, 'MEMBER');
    memberIdAdminA = await addMember(householdA, adminA, 'ADMIN');

    const ownerMembership = await prisma.householdMember.findFirstOrThrow({
      where: { householdId: householdA, userId: ownerA.id },
    });
    memberIdOwnerA = ownerMembership.id;
  }, 120_000);

  afterAll(async () => {
    for (const id of [householdA, householdB]) {
      if (id) await prisma.household.delete({ where: { id } }).catch(() => undefined);
    }
    for (const user of [ownerA, ownerB, viewerA, memberA, adminA]) {
      await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    }
    await app.close();
  }, 60_000);

  describe('sin JWT válido, ninguna ruta de datos responde', () => {
    it('sin cabecera Authorization → 401', async () => {
      await request(server).get('/api/v1/households/current/members').expect(401);
      await request(server).get('/api/v1/auth/me').expect(401);
    });

    it('con un token que no verifica → 401', async () => {
      await request(server)
        .get('/api/v1/households/current/members')
        .set('Authorization', 'Bearer basura-que-no-verifica')
        .expect(401);
    });

    it('el esquema tiene que ser Bearer', async () => {
      await request(server)
        .get('/api/v1/households/current/members')
        .set('Authorization', `Basic ${ownerA.id}|${ownerA.email}`)
        .expect(401);
    });

    it('/health sigue siendo público', async () => {
      await request(server).get('/api/v1/health').expect(200);
    });

    it('un usuario autenticado SIN household recibe 403 USER_NOT_PROVISIONED', async () => {
      const huerfano = { id: randomUUID(), email: `huerfano-${randomUUID()}@e2e.test` };
      const response = await request(server)
        .get('/api/v1/households/current/members')
        .set('Authorization', auth(huerfano))
        .expect(403);

      expect(response.body.code).toBe('USER_NOT_PROVISIONED');
    });
  });

  describe('household B contra los datos de A', () => {
    it('cada uno solo ve a los miembros del suyo', async () => {
      const fromA = await request(server)
        .get('/api/v1/households/current/members')
        .set('Authorization', auth(ownerA))
        .expect(200);
      const fromB = await request(server)
        .get('/api/v1/households/current/members')
        .set('Authorization', auth(ownerB))
        .expect(200);

      expect(fromA.body).toHaveLength(4); // owner + viewer + member + admin
      expect(fromB.body).toHaveLength(1); // solo su owner

      const idsA = fromA.body.map((m: { userId: string }) => m.userId);
      expect(idsA).not.toContain(ownerB.id);
    });

    it('B no puede cambiar el rol de un miembro de A, ni con su id exacto', async () => {
      await request(server)
        .patch(`/api/v1/households/current/members/${memberIdViewerA}/role`)
        .set('Authorization', auth(ownerB))
        .send({ role: 'ADMIN' })
        .expect(404);

      // Y de verdad no cambió.
      const untouched = await prisma.householdMember.findUniqueOrThrow({
        where: { id: memberIdViewerA },
      });
      expect(untouched.role).toBe('VIEWER');
    });

    it('B no puede expulsar a un miembro de A', async () => {
      await request(server)
        .delete(`/api/v1/households/current/members/${memberIdViewerA}`)
        .set('Authorization', auth(ownerB))
        .expect(404);

      const survived = await prisma.householdMember.findUnique({ where: { id: memberIdViewerA } });
      expect(survived).not.toBeNull();
    });

    it('B no puede transferir la propiedad de A', async () => {
      await request(server)
        .post('/api/v1/households/current/transfer-ownership')
        .set('Authorization', auth(ownerB))
        .send({ memberId: memberIdAdminA })
        .expect(404);
    });

    it('B no puede activar el household de A aunque conozca su id', async () => {
      await request(server)
        .post('/api/v1/auth/active-household')
        .set('Authorization', auth(ownerB))
        .send({ householdId: householdA })
        .expect(403);
    });
  });

  describe('permisos por rol dentro del household A (RN-43)', () => {
    it('un VIEWER puede leer', async () => {
      await request(server)
        .get('/api/v1/households/current/members')
        .set('Authorization', auth(viewerA))
        .expect(200);
    });

    it('un VIEWER no puede invitar', async () => {
      const response = await request(server)
        .post('/api/v1/households/current/invites')
        .set('Authorization', auth(viewerA))
        .send({ email: 'alguien@e2e.test', role: 'MEMBER' })
        .expect(403);

      expect(response.body.code).toBe('INSUFFICIENT_ROLE');
    });

    it('un MEMBER tampoco puede invitar', async () => {
      await request(server)
        .post('/api/v1/households/current/invites')
        .set('Authorization', auth(memberA))
        .send({ email: 'alguien@e2e.test', role: 'MEMBER' })
        .expect(403);
    });

    it('un ADMIN sí puede invitar', async () => {
      const response = await request(server)
        .post('/api/v1/households/current/invites')
        .set('Authorization', auth(adminA))
        .send({ email: `invitado-${randomUUID()}@e2e.test`, role: 'MEMBER' })
        .expect(201);

      expect(response.body.token).toBeTruthy();
    });

    it('un ADMIN no puede cambiar roles: eso es solo del OWNER', async () => {
      await request(server)
        .patch(`/api/v1/households/current/members/${memberIdViewerA}/role`)
        .set('Authorization', auth(adminA))
        .send({ role: 'ADMIN' })
        .expect(403);
    });

    it('un ADMIN no puede expulsar al OWNER', async () => {
      await request(server)
        .delete(`/api/v1/households/current/members/${memberIdOwnerA}`)
        .set('Authorization', auth(adminA))
        .expect(403);
    });

    it('el OWNER sí puede cambiar el rol de un miembro', async () => {
      const response = await request(server)
        .patch(`/api/v1/households/current/members/${memberIdViewerA}/role`)
        .set('Authorization', auth(ownerA))
        .send({ role: 'MEMBER' })
        .expect(200);

      expect(response.body.role).toBe('MEMBER');

      // Se deja como estaba para no afectar a los demás tests.
      await request(server)
        .patch(`/api/v1/households/current/members/${memberIdViewerA}/role`)
        .set('Authorization', auth(ownerA))
        .send({ role: 'VIEWER' })
        .expect(200);
    });
  });

  describe('el último OWNER (RN-44)', () => {
    it('no puede abandonar el household', async () => {
      const response = await request(server)
        .delete('/api/v1/households/current/members/me')
        .set('Authorization', auth(ownerA))
        .expect(409);

      expect(response.body.details.rule).toBe('RN-44');
    });

    it('no puede degradarse a sí mismo', async () => {
      await request(server)
        .patch(`/api/v1/households/current/members/${memberIdOwnerA}/role`)
        .set('Authorization', auth(ownerA))
        .send({ role: 'ADMIN' })
        .expect(409);
    });

    it('un MEMBER sí puede salirse', async () => {
      await request(server)
        .delete('/api/v1/households/current/members/me')
        .set('Authorization', auth(memberA))
        .expect(204);

      const gone = await prisma.householdMember.findFirst({
        where: { householdId: householdA, userId: memberA.id },
      });
      expect(gone).toBeNull();
    });
  });
});
