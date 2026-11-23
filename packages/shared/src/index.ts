export type ApiHealthResponse = {
  status: 'ok';
  service: 'ai-car-sales-crm-api';
  timestamp: string;
};

export type ApiReadinessResponse = {
  status: 'ready' | 'not_ready';
  dependencies: {
    postgres: 'available' | 'unavailable';
    redis: 'available' | 'unavailable';
  };
  timestamp: string;
};
