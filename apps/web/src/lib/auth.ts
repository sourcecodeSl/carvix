import type {
  AuthenticatedUserResponse,
  BranchResponse,
  BranchStatus,
  CreateStaffInvitationResponse,
  DealershipResponse,
  StaffDirectoryResponse,
  StaffInvitationPreviewResponse,
  AuditEventPageResponse,
  AuditEventResponse,
  AuditSummaryResponse,
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

export function getStaff(filters: {
  page: number;
  pageSize: number;
  q?: string;
  role?: 'SALES_MANAGER' | 'SALES_AGENT';
  status?: 'ACTIVE' | 'SUSPENDED';
}): Promise<StaffDirectoryResponse> {
  const query = new URLSearchParams({
    page: String(filters.page),
    pageSize: String(filters.pageSize),
  });
  if (filters.q) query.set('q', filters.q);
  if (filters.role) query.set('role', filters.role);
  if (filters.status) query.set('status', filters.status);
  return requestApi(`/api/v1/staff?${query.toString()}`);
}

export function updateStaffRole(membershipId: string, role: 'SALES_MANAGER' | 'SALES_AGENT') {
  return requestApi(`/api/v1/staff/members/${encodeURIComponent(membershipId)}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

export function updateStaffStatus(membershipId: string, status: 'ACTIVE' | 'SUSPENDED') {
  return requestApi(`/api/v1/staff/members/${encodeURIComponent(membershipId)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function updateStaffBranches(membershipId: string, branchIds: readonly string[]) {
  return requestApi(`/api/v1/staff/members/${encodeURIComponent(membershipId)}/branches`, {
    method: 'PUT',
    body: JSON.stringify({ branchIds }),
  });
}

export function getStaffInvitations(page = 1, pageSize = 20) {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return requestApi<{
    items: import('@aicrm/shared').StaffInvitationResponse[];
    total: number;
    page: number;
    pageSize: number;
  }>(`/api/v1/staff/invitations?${query.toString()}`);
}

export function createStaffInvitation(values: {
  email: string;
  role: 'SALES_MANAGER' | 'SALES_AGENT';
  branchIds: readonly string[];
}): Promise<CreateStaffInvitationResponse> {
  return requestApi('/api/v1/staff/invitations', {
    method: 'POST',
    body: JSON.stringify(values),
  });
}

export function cancelStaffInvitation(invitationId: string) {
  return requestApi(`/api/v1/staff/invitations/${encodeURIComponent(invitationId)}/cancel`, {
    method: 'PATCH',
  });
}

export function validateStaffInvitation(token: string): Promise<StaffInvitationPreviewResponse> {
  return requestApi('/api/v1/invitations/validate', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export function acceptStaffInvitation(
  token: string,
): Promise<{ status: 'accepted'; tenantId: string }> {
  return requestApi('/api/v1/invitations/accept', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export function acceptNewStaffInvitation(values: {
  token: string;
  name: string;
  password: string;
}): Promise<{ status: 'accepted'; tenantId: string }> {
  return requestApi('/api/v1/invitations/accept-new', {
    method: 'POST',
    body: JSON.stringify(values),
  });
}

export function getAuditEvents(filters: {
  page: number;
  pageSize: number;
  eventType?: string;
  category?: string;
  outcome?: string;
  actorUserId?: string;
  resourceType?: string;
  startDate?: string;
  endDate?: string;
}): Promise<AuditEventPageResponse> {
  const query = new URLSearchParams({
    page: String(filters.page),
    pageSize: String(filters.pageSize),
  });
  for (const [key, value] of Object.entries(filters)) {
    if (key !== 'page' && key !== 'pageSize' && value) query.set(key, String(value));
  }
  return requestApi(`/api/v1/audit/events?${query.toString()}`);
}

export function getAuditEvent(eventId: string): Promise<AuditEventResponse | null> {
  return requestApi(`/api/v1/audit/events/${encodeURIComponent(eventId)}`);
}

export function getAuditSummary(filters: {
  startDate?: string;
  endDate?: string;
}): Promise<AuditSummaryResponse> {
  const query = new URLSearchParams();
  if (filters.startDate) query.set('startDate', filters.startDate);
  if (filters.endDate) query.set('endDate', filters.endDate);
  const suffix = query.size ? `?${query.toString()}` : '';
  return requestApi(`/api/v1/audit/summary${suffix}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
