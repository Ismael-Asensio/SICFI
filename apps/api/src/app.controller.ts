import { Controller, Get } from '@nestjs/common';

import { AppService, HealthReport } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  getHealth(): Promise<HealthReport> {
    return this.appService.getHealth();
  }
}
