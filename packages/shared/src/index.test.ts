import { describe, expect, it } from 'vitest';
import type { ApiHealthResponse, ApiReadinessResponse } from './index.js';

describe('shared API contracts', () => {
  it('accepts the health response shape', () => {
    const response: ApiHealthResponse = {
      status: 'ok',
      service: 'ai-car-sales-crm-api',
      timestamp: new Date().toISOString(),
    };
    expect(response.status).toBe('ok');
  });

  it('accepts dependency readiness states', () => {
    const response: ApiReadinessResponse = {
      status: 'ready',
      dependencies: { postgres: 'available', redis: 'available' },
      timestamp: new Date().toISOString(),
    };
    expect(response.dependencies.redis).toBe('available');
  });
});
