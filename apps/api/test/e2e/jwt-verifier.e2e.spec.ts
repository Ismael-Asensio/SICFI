import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';

import { ConfigService } from '@nestjs/config';
import { SignJWT, exportJWK, generateKeyPair, type JWK, type KeyLike } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { JwtVerifier } from '../../src/shared/infrastructure/auth/jwt-verifier';

/**
 * El resto de la batería e2e sustituye `JwtVerifier` por un doble, para no
 * depender de Supabase Auth en vivo. Este spec cubre justo lo que allí queda
 * fuera: que el verificador REAL acepta un JWT bien firmado y rechaza todo lo
 * demás.
 *
 * Se levanta un JWKS local con una clave **ES256**, que es el algoritmo con el
 * que firma Supabase (comprobado contra el endpoint real de sicfi-dev).
 */
describe('JwtVerifier contra un JWKS real (e2e)', () => {
  let server: Server;
  let verifier: JwtVerifier;
  let issuer: string;
  let signKey: KeyLike;
  let otherKey: KeyLike;

  const AUDIENCE = 'authenticated';

  beforeAll(async () => {
    const pair = await generateKeyPair('ES256');
    const publicJwk: JWK = await exportJWK(pair.publicKey);
    publicJwk.kid = 'clave-de-prueba';
    publicJwk.alg = 'ES256';
    publicJwk.use = 'sig';
    signKey = pair.privateKey;

    // Una segunda clave que NUNCA se publica: sirve para probar que una firma
    // que no corresponde al JWKS se rechaza.
    otherKey = (await generateKeyPair('ES256')).privateKey;

    server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ keys: [publicJwk] }));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));

    const { port } = server.address() as AddressInfo;
    issuer = `http://127.0.0.1:${port}`;

    const config = {
      getOrThrow: (key: string) => (key === 'SUPABASE_JWKS_URL' ? `${issuer}/jwks.json` : issuer),
      get: () => AUDIENCE,
    } as unknown as ConfigService;

    verifier = new JwtVerifier(config);
  });

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  const sign = (key: KeyLike, claims: Record<string, unknown>, expiresIn = '1h') =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'ES256', kid: 'clave-de-prueba' })
      .setIssuedAt()
      .setIssuer(issuer)
      .setAudience(AUDIENCE)
      .setExpirationTime(expiresIn)
      .sign(key);

  it('acepta un token bien firmado y extrae el sub y el email', async () => {
    const token = await sign(signKey, { sub: 'user-123', email: 'quien@sea.test' });

    const verified = await verifier.verify(token);
    expect(verified).toEqual({ userId: 'user-123', email: 'quien@sea.test' });
  });

  it('rechaza un token firmado con otra clave', async () => {
    const token = await sign(otherKey, { sub: 'user-123', email: 'quien@sea.test' });
    expect(await verifier.verify(token)).toBeNull();
  });

  it('rechaza un token caducado', async () => {
    const token = await sign(signKey, { sub: 'user-123' }, '-1h');
    expect(await verifier.verify(token)).toBeNull();
  });

  it('rechaza un token de otro emisor', async () => {
    const token = await new SignJWT({ sub: 'user-123' })
      .setProtectedHeader({ alg: 'ES256', kid: 'clave-de-prueba' })
      .setIssuedAt()
      .setIssuer('https://un-emisor-cualquiera.test')
      .setAudience(AUDIENCE)
      .setExpirationTime('1h')
      .sign(signKey);

    expect(await verifier.verify(token)).toBeNull();
  });

  it('rechaza un token con otra audiencia', async () => {
    const token = await new SignJWT({ sub: 'user-123' })
      .setProtectedHeader({ alg: 'ES256', kid: 'clave-de-prueba' })
      .setIssuedAt()
      .setIssuer(issuer)
      .setAudience('otra-audiencia')
      .setExpirationTime('1h')
      .sign(signKey);

    expect(await verifier.verify(token)).toBeNull();
  });

  it('rechaza un token sin sub: sin él no hay usuario que resolver', async () => {
    const token = await sign(signKey, { email: 'sin-sub@test.test' });
    expect(await verifier.verify(token)).toBeNull();
  });

  it('rechaza basura que ni siquiera es un JWT', async () => {
    expect(await verifier.verify('no-soy-un-token')).toBeNull();
    expect(await verifier.verify('')).toBeNull();
  });
});
