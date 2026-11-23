import type { AuthenticatedUserResponse } from '@aicrm/shared';

export const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:3001';

export async function login(email: string, password: string) {
  const response = await fetch(`${apiBaseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  const payload = (await response.json()) as
    | { user: AuthenticatedUserResponse }
    | { message?: string };
  if (!response.ok) throw new Error('Invalid email or password.');
  return payload as { user: AuthenticatedUserResponse };
}

export async function getCurrentUser(): Promise<AuthenticatedUserResponse | null> {
  const response = await fetch(`${apiBaseUrl}/api/v1/auth/me`, {
    credentials: 'include',
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error('Unable to verify the current session.');
  return (await response.json()) as AuthenticatedUserResponse;
}

export async function logout(): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/v1/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Unable to log out.');
}

export async function selectActiveTenant(tenantId: string) {
  const response = await fetch(`${apiBaseUrl}/api/v1/auth/active-tenant`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId }),
  });
  if (!response.ok) throw new Error('Unable to select this dealership.');
  return (await response.json()) as {
    activeTenant: { tenantId: string; tenantName: string; role: string };
  };
}
