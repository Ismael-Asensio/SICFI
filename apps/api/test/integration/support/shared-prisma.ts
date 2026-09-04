import { PrismaService } from '../../../src/shared/infrastructure/prisma/prisma.service';

/**
 * Una sola conexión para toda la corrida de integración: el pooler de
 * Supabase free tiene margen justo (`connection_limit=1` en la cadena de
 * runtime), así que cada spec crear la suya agotaría el pool enseguida.
 */
export const sharedPrisma = new PrismaService();
