import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from './shared/infrastructure/prisma/prisma.service';

export interface HealthReport {
  status: 'ok' | 'degraded';
  database: 'up' | 'down';
}

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Además de servir de sonda, este endpoint es el que golpea el cron diario:
   * Supabase free pausa el proyecto tras 7 días sin actividad.
   */
  async getHealth(): Promise<HealthReport> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'up' };
    } catch (error) {
      this.logger.error('La sonda de base de datos falló', error);
      return { status: 'degraded', database: 'down' };
    }
  }
}
