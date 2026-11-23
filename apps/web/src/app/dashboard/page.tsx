'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Building2, MapPinned, Store, UsersRound } from 'lucide-react';
import { Permission } from '@aicrm/shared';
import { ApiRequestError, getBranches, getDealerships } from '../../lib/auth';
import type { BranchResponse, DealershipResponse } from '@aicrm/shared';
import { useDashboardSession } from '../../components/dashboard-session';

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useDashboardSession();
  const [dealership, setDealership] = useState<DealershipResponse | null>(null);
  const [branches, setBranches] = useState<BranchResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOverview = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      if (!user.activeTenant) {
        setDealership(null);
        setBranches([]);
        return;
      }
      const dealerships = await getDealerships();
      const activeDealership = dealerships[0] ?? null;
      setDealership(activeDealership);
      setBranches(activeDealership ? await getBranches(activeDealership.id) : []);
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.status === 401) {
        router.replace('/login');
        return;
      }
      setError(cause instanceof Error ? cause.message : 'Unable to load dealership details.');
    } finally {
      setLoading(false);
    }
  }, [router, user.activeTenant]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const activeBranchCount = branches.filter((branch) => branch.status === 'ACTIVE').length;

  return (
    <div className="space-y-7">
      <section className="rounded-2xl bg-slate-950 px-6 py-7 text-white shadow-sm sm:px-8 sm:py-9">
        <p className="text-sm font-semibold text-blue-300">Dealership overview</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Welcome, {user.name}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
          Manage your dealership profile and locations from one secure workspace.
        </p>
        <div className="mt-6 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-white/10 px-3 py-1.5">
            {user.activeTenant?.role ?? user.platformRole ?? 'No active role'}
          </span>
          <span className="rounded-full bg-white/10 px-3 py-1.5">Account {user.status}</span>
          {user.activeTenant && (
            <span className="rounded-full bg-white/10 px-3 py-1.5">
              {user.activeTenant.tenantName}
            </span>
          )}
        </div>
      </section>

      {error && (
        <section
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={() => void loadOverview()}
            className="mt-2 font-semibold underline"
          >
            Try again
          </button>
        </section>
      )}

      <section
        aria-label="Dealership statistics"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        <MetricCard
          label="Dealership"
          value={loading ? 'Loading' : (dealership?.businessName ?? 'Not set up')}
          detail={
            dealership ? `${dealership.country} · ${dealership.timezone}` : 'Profile setup required'
          }
          icon={<Store size={19} aria-hidden="true" />}
        />
        <MetricCard
          label="Branches"
          value={loading ? 'Loading' : dealership ? String(branches.length) : '—'}
          detail={dealership ? `${activeBranchCount} active` : 'Available after dealership setup'}
          icon={<MapPinned size={19} aria-hidden="true" />}
        />
        <MetricCard
          label="Signed in as"
          value={user.name}
          detail={user.email}
          icon={<Building2 size={19} aria-hidden="true" />}
        />
      </section>

      {!loading && !dealership && user.activeTenant && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-semibold text-amber-950">Dealership setup is incomplete</h2>
          <p className="mt-1 text-sm leading-6 text-amber-900">
            There is no dealership profile associated with this workspace yet. Ask your local
            administrator to run the documented development bootstrap.
          </p>
          <Link
            href="/dashboard/dealership"
            className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-amber-950 underline"
          >
            View dealership setup <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        <QuickLink
          href="/dashboard/dealership"
          title="Dealership profile"
          description="Review business details and update the fields your role can manage."
        />
        <QuickLink
          href="/dashboard/branches"
          title="Branch management"
          description="View locations and manage branches when your role permits."
        />
        {user.permissions.includes(Permission.USER_READ) && (
          <QuickLink
            href="/dashboard/staff"
            title="Staff"
            description="Review tenant staff, branch access, and development invitation status."
            icon={<UsersRound size={17} aria-hidden="true" />}
          />
        )}
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <span className="text-blue-700">{icon}</span>
      </div>
      <p className="mt-4 truncate text-xl font-bold text-slate-950" title={value}>
        {value}
      </p>
      <p className="mt-1 truncate text-sm text-slate-500" title={detail}>
        {detail}
      </p>
    </article>
  );
}

function QuickLink({
  href,
  title,
  description,
  icon = <ArrowRight size={17} aria-hidden="true" />,
}: {
  href: string;
  title: string;
  description: string;
  icon?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md"
    >
      <span className="flex items-center justify-between">
        <span className="font-semibold text-slate-950">{title}</span>
        <span className="text-slate-400 group-hover:text-blue-700">{icon}</span>
      </span>
      <span className="mt-2 block text-sm leading-6 text-slate-600">{description}</span>
    </Link>
  );
}
