'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  CarFront,
  ChevronDown,
  CircleHelp,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Store,
} from 'lucide-react';
import type { AuthenticatedUserResponse } from '@aicrm/shared';
import { getCurrentUser, logout, selectActiveTenant } from '../../lib/auth';
import { DashboardSessionProvider } from '../../components/dashboard-session';

const primaryNavigation = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/dealership', label: 'Dealership', icon: Store },
  { href: '/dashboard/branches', label: 'Branches', icon: MapPinned },
] as const;

const upcomingNavigation = [
  'Vehicles',
  'Leads',
  'AI Assistant',
  'WhatsApp',
  'Appointments',
  'Analytics',
] as const;

export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AuthenticatedUserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refreshUser = useCallback(async () => {
    const current = await getCurrentUser();
    if (!current) {
      router.replace('/login');
      return null;
    }
    setUser(current);
    return current;
  }, [router]);

  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then((current) => {
        if (!active) return;
        if (!current) {
          router.replace('/login');
          return;
        }
        setUser(current);
      })
      .catch(() => {
        if (active) setError('We could not verify your session. Check the connection and retry.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [router]);

  async function handleTenantChange(tenantId: string) {
    setError('');
    setBusy(true);
    try {
      await selectActiveTenant(tenantId);
      const current = await refreshUser();
      if (!current) return;
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to select this workspace.');
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setError('');
    setBusy(true);
    try {
      await logout();
      router.replace('/login');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign out.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 px-5">
        <p className="animate-pulse text-sm font-medium text-slate-500">Loading your workspace…</p>
      </main>
    );
  }

  if (!user) {
    if (error) {
      return (
        <main className="grid min-h-screen place-items-center bg-slate-50 px-5">
          <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
            <h1 className="text-xl font-semibold text-slate-950">Workspace unavailable</h1>
            <p className="mt-2 text-sm text-slate-600">{error}</p>
            <button
              type="button"
              onClick={() => {
                setError('');
                setLoading(true);
                void refreshUser()
                  .catch(() =>
                    setError('We could not verify your session. Check the connection and retry.'),
                  )
                  .finally(() => setLoading(false));
              }}
              className="mt-5 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
            >
              Retry
            </button>
          </section>
        </main>
      );
    }
    return null;
  }

  return (
    <DashboardSessionProvider value={{ user, refreshUser, replaceUser: setUser }}>
      <div className="min-h-screen bg-slate-50 text-slate-900 lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="border-b border-slate-200 bg-white lg:flex lg:min-h-screen lg:flex-col lg:border-b-0 lg:border-r">
          <Link href="/dashboard" className="flex items-center gap-3 px-5 py-5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-950 text-white">
              <CarFront size={21} aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-bold tracking-tight">Carvix</span>
              <span className="block text-xs text-slate-500">Dealer workspace</span>
            </span>
          </Link>

          <div className="px-4 pb-4">
            {user.memberships.length > 1 ? (
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Active workspace
                </span>
                <span className="relative block">
                  <select
                    value={user.activeTenant?.tenantId ?? ''}
                    disabled={busy}
                    onChange={(event) => void handleTenantChange(event.target.value)}
                    className="h-10 w-full appearance-none rounded-lg border border-slate-200 bg-slate-50 px-3 pr-9 text-sm font-medium"
                    aria-label="Select active workspace"
                  >
                    <option value="" disabled>
                      Choose a workspace
                    </option>
                    {user.memberships
                      .filter((membership) => membership.status === 'ACTIVE')
                      .map((membership) => (
                        <option key={membership.id} value={membership.tenantId}>
                          {membership.tenantName}
                        </option>
                      ))}
                  </select>
                  <ChevronDown
                    size={15}
                    aria-hidden="true"
                    className="pointer-events-none absolute right-3 top-3 text-slate-500"
                  />
                </span>
              </label>
            ) : (
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Active workspace
                </p>
                <p className="mt-1 truncate text-sm font-medium">
                  {user.activeTenant?.tenantName ?? 'No active workspace'}
                </p>
              </div>
            )}
          </div>

          <nav
            aria-label="Main navigation"
            className="flex gap-1 overflow-x-auto px-3 pb-3 lg:block lg:flex-1"
          >
            {primaryNavigation.map(({ href, label, icon: Icon }) => {
              const active =
                pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                    active
                      ? 'bg-blue-50 text-blue-800'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                  }`}
                >
                  <Icon size={17} aria-hidden="true" />
                  {label}
                </Link>
              );
            })}
            <p className="px-3 pb-2 pt-5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
              Coming soon
            </p>
            {upcomingNavigation.map((label) => (
              <button
                key={label}
                type="button"
                disabled
                aria-disabled="true"
                className="hidden w-full cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-400 lg:flex"
                title={`${label} is not available yet`}
              >
                <CircleHelp size={16} aria-hidden="true" />
                {label}
              </button>
            ))}
          </nav>

          <div className="hidden border-t border-slate-200 p-4 lg:block">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
            <p className="mt-2 text-xs font-medium text-slate-600">
              {user.activeTenant?.role ?? user.platformRole ?? 'No active role'}
            </p>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="flex min-h-[68px] items-center justify-between border-b border-slate-200 bg-white px-5 sm:px-8">
            <div>
              <p className="text-xs font-medium text-slate-500">Account status</p>
              <p className="text-sm font-semibold">{user.status}</p>
            </div>
            <button
              type="button"
              onClick={() => void handleLogout()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <LogOut size={16} aria-hidden="true" />
              Sign out
            </button>
          </header>
          {error && (
            <div
              role="alert"
              className="mx-5 mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:mx-8"
            >
              {error}
            </div>
          )}
          <main className="mx-auto w-full max-w-7xl px-5 py-7 sm:px-8 sm:py-9">{children}</main>
        </div>
      </div>
    </DashboardSessionProvider>
  );
}
