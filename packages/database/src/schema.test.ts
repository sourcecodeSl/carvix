import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Prisma Day 1 schema', () => {
  it('defines tenant and user models with tenant ownership', async () => {
    const schema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
    expect(schema).toContain('model Tenant');
    expect(schema).toContain('model User');
    expect(schema).toContain('tenantId');
  });
});
