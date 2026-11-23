'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import {
  acceptNewStaffInvitation,
  acceptStaffInvitation,
  getCurrentUser,
  logout,
  selectActiveTenant,
  validateStaffInvitation,
} from '../../lib/auth';
import type { AuthenticatedUserResponse, StaffInvitationPreviewResponse } from '@aicrm/shared';

export default function InvitationPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [invitation, setInvitation] = useState<StaffInvitationPreviewResponse | null>(null);
  const [user, setUser] = useState<AuthenticatedUserResponse | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const rawToken = window.location.hash.slice(1);
    window.history.replaceState(null, '', '/invite');
    if (!rawToken) {
      setError('This invitation link is missing its one-time token.');
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setToken(rawToken);
    Promise.all([validateStaffInvitation(rawToken), getCurrentUser()])
      .then(([details, currentUser]) => {
        if (!active) return;
        setInvitation(details);
        setUser(currentUser);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error ? cause.message : 'This invitation is invalid or expired.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function acceptExisting() {
    setSaving(true);
    setError('');
    try {
      const result = await acceptStaffInvitation(token);
      await selectActiveTenant(result.tenantId);
      router.replace('/dashboard');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to accept this invitation.');
    } finally {
      setSaving(false);
    }
  }

  async function acceptNew(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await acceptNewStaffInvitation({ token, name: name.trim(), password });
      setAccepted(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create the invited account.');
    } finally {
      setSaving(false);
    }
  }

  async function switchAccount() {
    setSaving(true);
    setError('');
    try {
      await logout();
      window.location.assign(`/invite#${token}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign out.');
      setSaving(false);
    }
  }

  const accountMatches =
    !!user &&
    !!invitation &&
    user.email.trim().toLowerCase() === invitation.email.trim().toLowerCase();

  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 px-5 py-10">
      <section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
        <p className="text-sm font-semibold text-blue-700">Carvix staff access</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Accept invitation</h1>
        {loading ? (
          <p role="status" className="mt-5 animate-pulse text-sm text-slate-500">
            Checking invitation…
          </p>
        ) : accepted ? (
          <div className="mt-5 space-y-3">
            <p role="status" className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900">
              Your account is ready. Sign in to open the dealership workspace.
            </p>
            <Link
              href="/login"
              className="inline-flex rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white"
            >
              Go to sign in
            </Link>
          </div>
        ) : invitation ? (
          <>
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <p>
                <span className="font-semibold">Workspace:</span> {invitation.tenantName}
              </p>
              <p className="mt-1">
                <span className="font-semibold">Invited email:</span> {invitation.email}
              </p>
              <p className="mt-1">
                <span className="font-semibold">Role:</span> {invitation.role.replaceAll('_', ' ')}
              </p>
              <p className="mt-1">
                <span className="font-semibold">Branches:</span>{' '}
                {invitation.branches.length
                  ? invitation.branches.map((branch) => branch.name).join(', ')
                  : 'No branch access'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Expires {new Date(invitation.expiresAt).toLocaleString()}
              </p>
            </div>
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
              This is a local development preview. No email was sent, and production invitations
              remain disabled until trusted email delivery and verification are configured.
            </p>

            {user && accountMatches ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void acceptExisting()}
                className="mt-5 h-11 w-full rounded-lg bg-slate-950 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? 'Accepting…' : 'Accept with signed-in account'}
              </button>
            ) : user ? (
              <div className="mt-5 space-y-3">
                <p className="text-sm text-slate-700">
                  You are signed in as <strong>{user.email}</strong>. Sign in with the invited
                  account to continue.
                </p>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void switchAccount()}
                  className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 disabled:opacity-60"
                >
                  Sign out and choose another account
                </button>
              </div>
            ) : (
              <form onSubmit={acceptNew} className="mt-5 space-y-4">
                <label className="block text-sm font-medium text-slate-700">
                  Your name
                  <input
                    required
                    minLength={1}
                    maxLength={120}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 font-normal"
                  />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Create a password
                  <input
                    required
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={1024}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 font-normal"
                  />
                  <span className="mt-1 block text-xs font-normal text-slate-500">
                    Use at least 12 characters.
                  </span>
                </label>
                <button
                  type="submit"
                  disabled={saving}
                  className="h-11 w-full rounded-lg bg-slate-950 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving ? 'Creating account…' : 'Create account and accept'}
                </button>
              </form>
            )}
          </>
        ) : (
          <p className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error || 'This invitation is invalid or expired.'}
          </p>
        )}

        {error && invitation && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {error}
          </p>
        )}
        {!accepted && (
          <Link
            href="/login"
            className="mt-5 inline-flex text-sm font-medium text-slate-600 underline"
          >
            Return to sign in
          </Link>
        )}
      </section>
    </main>
  );
}
