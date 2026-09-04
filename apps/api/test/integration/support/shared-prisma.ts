import { PrismaService } from '../../../src/shared/infrastructure/prisma/prisma.service';
import { TenantScopedPrisma } from '../../../src/shared/infrastructure/prisma/tenant-scoped-prisma';
import { AsyncLocalTenantContext } from '../../../src/shared/infrastructure/tenant/async-local-tenant-context';

/**
 * Una sola conexión para toda la corrida de integración: el pooler de
 * Supabase free tiene margen justo (`connection_limit=1` en la cadena de
 * runtime), así que cada spec creando la suya agotaría el pool enseguida.
 *
 * `sharedPrisma` es el cliente CRUDO, sin aislamiento de tenant. Se usa solo
 * para el andamiaje de los tests (crear y borrar el household de prueba,
 * comprobar filas directamente). Los repositorios bajo prueba reciben
 * `scopedPrisma`, que sí lleva la extensión.
 */
export const sharedPrisma = new PrismaService();

export const tenantContext = new AsyncLocalTenantContext();

export const scopedPrisma = new TenantScopedPrisma(sharedPrisma, tenantContext);
