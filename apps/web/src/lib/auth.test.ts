import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDealerships, updateBranchStatus } from './auth';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('management API requests', () => {
  it('uses cookie credentials for dealership reads', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));

    await expect(getDealerships()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/dealerships$/),
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('uses a status-only API route for branch state changes', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ status: 'INACTIVE' }), { status: 200 }));

    await updateBranchStatus('dealer-id', 'branch-id', 'INACTIVE');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/dealerships\/dealer-id\/branches\/branch-id\/status$/),
      expect.objectContaining({
        method: 'PATCH',
        credentials: 'include',
        body: JSON.stringify({ status: 'INACTIVE' }),
      }),
    );
  });
});
