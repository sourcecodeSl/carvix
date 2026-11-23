'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { AuthenticatedUserResponse } from '@aicrm/shared';
import { getCurrentUser, logout } from '../../lib/auth';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthenticatedUserResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentUser()
      .then((current) => {
        if (!current) router.replace('/login');
        else setUser(current);
      })
      .catch(() => router.replace('/login'))
      .finally(() => setLoading(false));
  }, [router]);

  async function signOut() {
    await logout();
    router.replace('/login');
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-slate-100">Loading…</main>;
  }
  if (!user) return null;

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-10">
      <section className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-blue-700">Protected development dashboard</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-950">{user.name}</h1>
          </div>
          <button
            onClick={signOut}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold"
          >
            Logout
          </button>
        </div>
        <dl className="mt-8 grid gap-4 sm:grid-cols-2">
          <Info label="Email" value={user.email} />
          <Info label="Account status" value={user.status} />
          <Info
            label="Active dealership"
            value={user.activeTenant?.tenantName ?? 'No active dealership'}
          />
          <Info
            label="Current role"
            value={user.activeTenant?.role ?? user.platformRole ?? 'None'}
          />
        </dl>
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-2 text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}
