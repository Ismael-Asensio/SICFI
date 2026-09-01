import { INestApplication, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Cliente Prisma único de la aplicación.
 *
 * En serverless (Vercel) cada invocación reutiliza el proceso Node. Sin un
 * singleton, cada arranque de módulo abriría un pool nuevo y Postgres devolvería
 * "too many connections" al primer pico de tráfico. Por eso:
 *
 *   1. El proveedor es global (ver `PrismaModule`) — una sola instancia por proceso.
 *   2. En desarrollo se cachea en `globalThis` para sobrevivir al hot-reload.
 *   3. `DATABASE_URL` debe llevar `pgbouncer=true&connection_limit=1`; las
 *      migraciones usan `DIRECT_URL` (:5432), que el pooler no soporta para DDL.
 */
const globalForPrisma = globalThis as unknown as { sicfiPrisma?: PrismaClient };

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? [{ emit: 'event', level: 'query' }, 'warn', 'error']
          : ['warn', 'error'],
      errorFormat: 'minimal',
    });

    if (process.env.NODE_ENV !== 'production') {
      if (globalForPrisma.sicfiPrisma) {
        return globalForPrisma.sicfiPrisma as PrismaService;
      }
      globalForPrisma.sicfiPrisma = this;
    }
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Conexión a Postgres establecida');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Cierra el cliente cuando Nest recibe SIGTERM, para no dejar conexiones
   * colgando en el pooler entre despliegues.
   */
  enableShutdownHooks(app: INestApplication): void {
    process.on('beforeExit', () => {
      void app.close();
    });
  }
}
