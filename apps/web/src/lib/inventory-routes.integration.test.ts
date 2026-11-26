import { describe, expect, it } from 'vitest';

const enabled = process.env.RUN_WEB_ROUTE_INTEGRATION === 'true';
const baseUrl = process.env.WEB_BASE_URL ?? 'http://127.0.0.1:3000';

describe.skipIf(!enabled)('inventory dashboard local HTTP integration', () => {
  it.each(['/dashboard/inventory', '/dashboard/settings/inventory'])(
    'serves %s as an App Router page',
    async (path) => {
      const response = await fetch(new URL(path, baseUrl), { redirect: 'manual' });
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      await response.body?.cancel();
    },
    15000,
  );
});
