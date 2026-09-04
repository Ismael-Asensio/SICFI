import { Controller, Get } from '@nestjs/common';

import { Public } from './shared/infrastructure/http/auth.decorators';

import { AppService, HealthReport } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
   * Única ruta sin JWT. Además de sonda, la golpea el cron diario: Supabase
   * free pausa el proyecto tras 7 días sin actividad.
   */
  @Public()
  @Get('health')
  getHealth(): Promise<HealthReport> {
    return this.appService.getHealth();
  }
}
