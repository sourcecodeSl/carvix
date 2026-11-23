import type {
  AuthenticatedUserResponse,
  BranchResponse,
  BranchStatus,
  DealershipResponse,
} from '@aicrm/shared';

export const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3001';

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function requestApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });
  const payload = response.status === 204 ? undefined : ((await response.json()) as unknown);
  if (!response.ok) {
    const body = isRecord(payload) ? payload : {};
    const message = Array.isArray(body.message)
      ? body.message.join(', ')
      : typeof body.message === 'string'
        ? body.message
        : 'The request could not be completed.';
    throw new ApiRequestError(message, response.status);
  }
  return payload as T;
}

export async function login(email: string, password: string) {
  try {
    return await requestApi<{ user: AuthenticatedUserResponse }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      throw new Error('Invalid email or password.');
    }
    throw error;
  }
}

export async function getCurrentUser(): Promise<AuthenticatedUserResponse | null> {
  try {
    return await requestApi<AuthenticatedUserResponse>('/api/v1/auth/me');
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) return null;
    throw error;
  }
}

export async function logout(): Promise<void> {
  await requestApi<{ status: 'ok' }>('/api/v1/auth/logout', {
    method: 'POST',
  });
}

export async function selectActiveTenant(tenantId: string) {
  return requestApi<{
    activeTenant: { tenantId: string; tenantName: string; role: string };
  }>('/api/v1/auth/active-tenant', {
    method: 'POST',
    body: JSON.stringify({ tenantId }),
  });
}

export function getDealerships(): Promise<DealershipResponse[]> {
  return requestApi('/api/v1/dealerships');
}

export function updateDealership(
  dealershipId: string,
  values: Partial<
    Pick<
      DealershipResponse,
      'businessName' | 'contactEmail' | 'contactPhone' | 'country' | 'timezone' | 'currency'
    >
  >,
): Promise<DealershipResponse> {
  return requestApi(`/api/v1/dealerships/${encodeURIComponent(dealershipId)}`, {
    method: 'PATCH',
    body: JSON.stringify(values),
  });
}

export function getBranches(dealershipId: string): Promise<BranchResponse[]> {
  return requestApi(`/api/v1/dealerships/${encodeURIComponent(dealershipId)}/branches`);
}

export function createBranch(
  dealershipId: string,
  values: Pick<BranchResponse, 'name' | 'code'> &
    Partial<Pick<BranchResponse, 'address' | 'city' | 'phone'>>,
): Promise<BranchResponse> {
  return requestApi(`/api/v1/dealerships/${encodeURIComponent(dealershipId)}/branches`, {
    method: 'POST',
    body: JSON.stringify(values),
  });
}

export function updateBranch(
  dealershipId: string,
  branchId: string,
  values: Partial<Pick<BranchResponse, 'name' | 'code' | 'address' | 'city' | 'phone'>>,
): Promise<BranchResponse> {
  return requestApi(
    `/api/v1/dealerships/${encodeURIComponent(dealershipId)}/branches/${encodeURIComponent(branchId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(values),
    },
  );
}

export function updateBranchStatus(
  dealershipId: string,
  branchId: string,
  status: BranchStatus,
): Promise<BranchResponse> {
  return requestApi(
    `/api/v1/dealerships/${encodeURIComponent(dealershipId)}/branches/${encodeURIComponent(branchId)}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
