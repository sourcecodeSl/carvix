import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { ApiHealthResponse } from '@aicrm/shared';
import { ReadinessService } from './readiness.service';

@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly readiness: ReadinessService) {}

  @Get()
  health(): ApiHealthResponse {
    return {
      status: 'ok',
      service: 'ai-car-sales-crm-api',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async ready(@Res({ passthrough: true }) response: Response) {
    const result = await this.readiness.check();
    if (result.status !== 'ready') {
      response.status(503);
    }
    return { ...result, timestamp: new Date().toISOString() };
  }
}
