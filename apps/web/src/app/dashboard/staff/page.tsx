'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Copy, MailPlus, RefreshCw, UsersRound } from 'lucide-react';
import { Permission } from '@aicrm/shared';
import type { BranchResponse, StaffInvitationResponse, StaffMemberResponse } from '@aicrm/shared';
import {
  ApiRequestError,
  cancelStaffInvitation,
  createStaffInvitation,
  getBranches,
  getDealerships,
  getStaff,
  getStaffInvitations,
  updateStaffBranches,
  updateStaffRole,
  updateStaffStatus,
} from '../../../lib/auth';
import { useDashboardSession } from '../../../components/dashboard-session';

const pageSize = 20;

export default function StaffPage() {
  const router = useRouter();
  const { user } = useDashboardSession();
  const canInvite = user.permissions.includes(Permission.USER_INVITE);
  const canUpdate = user.permissions.includes(Permission.USER_UPDATE);
  const [members, setMembers] = useState<readonly StaffMemberResponse[]>([]);
  const [invitations, setInvitations] = useState<StaffInvitationResponse[]>([]);
  const [branches, setBranches] = useState<BranchResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filterDraft, setFilterDraft] = useState('');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'' | 'SALES_MANAGER' | 'SALES_AGENT'>('');
  const [statusFilter, setStatusFilter] = useState<'' | 'ACTIVE' | 'SUSPENDED'>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'SALES_MANAGER' | 'SALES_AGENT'>('SALES_AGENT');
  const [inviteBranchIds, setInviteBranchIds] = useState<string[]>([]);
  const [previewUrl, setPreviewUrl] = useState('');
  const [editingMembershipId, setEditingMembershipId] = useState('');
  const [editingBranchIds, setEditingBranchIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!user.activeTenant) {
      setMembers([]);
      setInvitations([]);
      setBranches([]);
      setLoading(false);
      return;
    }

    setError('');
    setLoading(true);
    try {
      const directory = await getStaff({
        page,
        pageSize,
        ...(query ? { q: query } : {}),
        ...(roleFilter ? { role: roleFilter } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
      });
      setMembers(directory.items);
      setTotal(directory.total);

      if (canInvite) {
        const [invitePage, dealerships] = await Promise.all([
          getStaffInvitations(),
          getDealerships(),
        ]);
        setInvitations(invitePage.items);
        const dealership = dealerships[0];
        setBranches(dealership ? await getBranches(dealership.id) : []);
      }
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.status === 401) {
        router.replace('/login');
        return;
      }
      setError(cause instanceof Error ? cause.message : 'Unable to load tenant staff.');
    } finally {
      setLoading(false);
    }
  }, [canInvite, page, query, roleFilter, router, statusFilter, user.activeTenant]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    setPreviewUrl('');
    setSaving(true);
    try {
      const created = await createStaffInvitation({
        email: inviteEmail.trim(),
        role: inviteRole,
        branchIds: inviteBranchIds,
      });
      setPreviewUrl(created.previewUrl);
      setInviteEmail('');
      setInviteBranchIds([]);
      setNotice('Invitation created. Copy the one-time local preview link; no email was sent.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create the invitation.');
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(member: StaffMemberResponse, role: 'SALES_MANAGER' | 'SALES_AGENT') {
    setError('');
    setNotice('');
    setSaving(true);
    try {
      await updateStaffRole(member.id, role);
      setNotice(`${member.name}’s role was updated.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update the staff role.');
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(member: StaffMemberResponse) {
    const status = member.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    if (status === 'SUSPENDED' && !window.confirm(`Suspend ${member.name} in this tenant?`)) {
      return;
    }
    setError('');
    setNotice('');
    setSaving(true);
    try {
      await updateStaffStatus(member.id, status);
      setNotice(
        status === 'ACTIVE' ? `${member.name} was reactivated.` : `${member.name} was suspended.`,
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update membership status.');
    } finally {
      setSaving(false);
    }
  }

  function startBranchEdit(member: StaffMemberResponse) {
    setEditingMembershipId(member.id);
    setEditingBranchIds(member.branches.map((branch) => branch.id));
    setError('');
  }

  async function saveBranches(member: StaffMemberResponse) {
    setError('');
    setNotice('');
    setSaving(true);
    try {
      await updateStaffBranches(member.id, editingBranchIds);
      setEditingMembershipId('');
      setNotice(`${member.name}’s branch assignments were saved.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update branch assignments.');
    } finally {
      setSaving(false);
    }
  }

  async function cancelInvitation(invitation: StaffInvitationResponse) {
    setError('');
    setNotice('');
    setSaving(true);
    try {
      await cancelStaffInvitation(invitation.id);
      setNotice(`Invitation for ${invitation.email} was cancelled.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to cancel the invitation.');
    } finally {
      setSaving(false);
    }
  }

  async function copyPreviewLink() {
    try {
      await navigator.clipboard.writeText(previewUrl);
      setNotice('Preview link copied.');
    } catch {
      setError('Could not access the clipboard. Select and copy the preview link instead.');
    }
  }

  const activeBranches = branches.filter((branch) => branch.status === 'ACTIVE');
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-7">
      <header>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Dashboard
        </Link>
        <div className="mt-4 flex items-end gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-800">
            <UsersRound size={21} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-blue-700">Team access</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">Staff</h1>
          </div>
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Memberships and branch access are scoped to the active dealership workspace. Suspending a
          membership removes its tenant access without deleting its history.
        </p>
      </header>

      {error && <Notice message={error} tone="error" />}
      {notice && <Notice message={notice} tone="success" />}

      {!user.activeTenant ? (
        <EmptyState message="Select an authorized workspace before managing staff." />
      ) : (
        <>
          {canInvite && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center gap-2">
                <MailPlus size={18} className="text-blue-700" aria-hidden="true" />
                <h2 className="text-lg font-semibold text-slate-950">Invite staff</h2>
              </div>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Local development creates a one-time preview link. It does not send email;
                production invitations remain unavailable until trusted email delivery and
                verification exist.
              </p>
              <form onSubmit={submitInvitation} className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">
                  Staff email
                  <input
                    type="email"
                    required
                    maxLength={320}
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 font-normal"
                  />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Role
                  <select
                    value={inviteRole}
                    onChange={(event) =>
                      setInviteRole(event.target.value as 'SALES_MANAGER' | 'SALES_AGENT')
                    }
                    className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal"
                  >
                    <option value="SALES_AGENT">Sales Agent</option>
                    <option value="SALES_MANAGER">Sales Manager</option>
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700 md:col-span-2">
                  Initial branch access
                  <select
                    multiple
                    value={inviteBranchIds}
                    onChange={(event) =>
                      setInviteBranchIds(
                        Array.from(event.currentTarget.selectedOptions, (option) => option.value),
                      )
                    }
                    className="mt-1 min-h-24 w-full rounded-lg border border-slate-300 bg-white p-2 font-normal"
                  >
                    {activeBranches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name} ({branch.code})
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs font-normal text-slate-500">
                    No selection means the invited staff member has no branch access until assigned.
                  </span>
                </label>
                <button
                  type="submit"
                  disabled={saving}
                  className="h-10 justify-self-start rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving ? 'Creating…' : 'Create invitation'}
                </button>
              </form>
              {previewUrl && (
                <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-blue-900">
                    One-time local preview link
                    <input
                      readOnly
                      value={previewUrl}
                      className="mt-2 h-10 w-full rounded-md border border-blue-200 bg-white px-3 font-mono text-xs font-normal text-slate-800"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void copyPreviewLink()}
                    className="mt-3 inline-flex items-center gap-2 rounded-md border border-blue-300 bg-white px-3 py-2 text-xs font-semibold text-blue-900"
                  >
                    <Copy size={14} aria-hidden="true" />
                    Copy link
                  </button>
                </div>
              )}
            </section>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Tenant directory</h2>
                <p className="mt-1 text-sm text-slate-500">{total} staff memberships</p>
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  setPage(1);
                  setQuery(filterDraft.trim());
                }}
                className="flex gap-2"
              >
                <label className="sr-only" htmlFor="staff-search">
                  Search staff
                </label>
                <input
                  id="staff-search"
                  value={filterDraft}
                  onChange={(event) => setFilterDraft(event.target.value)}
                  placeholder="Search by name"
                  maxLength={100}
                  className="h-10 rounded-lg border border-slate-300 px-3 text-sm"
                />
                <label className="sr-only" htmlFor="staff-role-filter">
                  Filter by role
                </label>
                <select
                  id="staff-role-filter"
                  value={roleFilter}
                  onChange={(event) => {
                    setPage(1);
                    setRoleFilter(event.target.value as '' | 'SALES_MANAGER' | 'SALES_AGENT');
                  }}
                  className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm"
                >
                  <option value="">All roles</option>
                  <option value="SALES_MANAGER">Sales Manager</option>
                  <option value="SALES_AGENT">Sales Agent</option>
                </select>
                <label className="sr-only" htmlFor="staff-status-filter">
                  Filter by status
                </label>
                <select
                  id="staff-status-filter"
                  value={statusFilter}
                  onChange={(event) => {
                    setPage(1);
                    setStatusFilter(event.target.value as '' | 'ACTIVE' | 'SUSPENDED');
                  }}
                  className="h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm"
                >
                  <option value="">All statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="SUSPENDED">Suspended</option>
                </select>
                <button
                  type="submit"
                  className="h-10 rounded-lg border border-slate-300 px-3 text-sm font-semibold"
                >
                  Search
                </button>
              </form>
            </div>

            {loading ? (
              <p role="status" className="mt-5 animate-pulse text-sm text-slate-500">
                Loading staff…
              </p>
            ) : members.length === 0 ? (
              <EmptyState message="No staff memberships match this search." />
            ) : (
              <div className="mt-5 space-y-3">
                {members.map((member) => {
                  const isSelf = member.userId === user.id;
                  return (
                    <article key={member.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <h3 className="font-semibold text-slate-950">{member.name}</h3>
                          {member.email && (
                            <p className="mt-0.5 text-sm text-slate-600">{member.email}</p>
                          )}
                          <p className="mt-1 text-xs text-slate-500">
                            {member.role.replaceAll('_', ' ')} · {member.status}
                            {isSelf ? ' · You' : ''}
                          </p>
                          <p className="mt-2 text-sm text-slate-600">
                            {member.branches.length
                              ? member.branches
                                  .map((branch) => `${branch.name} (${branch.code})`)
                                  .join(', ')
                              : 'No branch assignments'}
                          </p>
                        </div>
                        {canUpdate && !isSelf && (
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="sr-only" htmlFor={`role-${member.id}`}>
                              Update role for {member.name}
                            </label>
                            <select
                              id={`role-${member.id}`}
                              value={member.role}
                              disabled={saving}
                              onChange={(event) => {
                                const role = event.target.value;
                                if (role === 'SALES_MANAGER' || role === 'SALES_AGENT') {
                                  void changeRole(member, role);
                                }
                              }}
                              className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs"
                            >
                              {member.role === 'DEALER_ADMIN' && (
                                <option value="DEALER_ADMIN" disabled>
                                  Dealer Admin
                                </option>
                              )}
                              <option value="SALES_AGENT">Sales Agent</option>
                              <option value="SALES_MANAGER">Sales Manager</option>
                            </select>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void changeStatus(member)}
                              className="h-9 rounded-md border border-slate-300 px-3 text-xs font-semibold"
                            >
                              {member.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => startBranchEdit(member)}
                              className="h-9 rounded-md border border-slate-300 px-3 text-xs font-semibold"
                            >
                              Assign branches
                            </button>
                          </div>
                        )}
                      </div>
                      {editingMembershipId === member.id && (
                        <div className="mt-4 rounded-lg bg-slate-50 p-3">
                          <label
                            htmlFor={`branches-${member.id}`}
                            className="block text-sm font-medium text-slate-700"
                          >
                            Active branch access
                          </label>
                          <select
                            id={`branches-${member.id}`}
                            multiple
                            value={editingBranchIds}
                            onChange={(event) =>
                              setEditingBranchIds(
                                Array.from(
                                  event.currentTarget.selectedOptions,
                                  (option) => option.value,
                                ),
                              )
                            }
                            className="mt-2 min-h-24 w-full rounded-md border border-slate-300 bg-white p-2 text-sm"
                          >
                            {activeBranches.map((branch) => (
                              <option key={branch.id} value={branch.id}>
                                {branch.name} ({branch.code})
                              </option>
                            ))}
                          </select>
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void saveBranches(member)}
                              className="rounded-md bg-slate-950 px-3 py-2 text-xs font-semibold text-white"
                            >
                              Save assignments
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingMembershipId('')}
                              className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}

            <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((value) => value - 1)}
                className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-xs text-slate-500">
                Page {page} of {pageCount}
              </span>
              <button
                type="button"
                disabled={page >= pageCount || loading}
                onClick={() => setPage((value) => value + 1)}
                className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </section>

          {canInvite && (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">Invitation history</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Tokens and preview links are never returned by this list.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void load()}
                  aria-label="Refresh invitations"
                  className="rounded-md border border-slate-300 p-2 text-slate-600"
                >
                  <RefreshCw size={16} aria-hidden="true" />
                </button>
              </div>
              {invitations.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">No invitations yet.</p>
              ) : (
                <ul className="mt-4 divide-y divide-slate-100">
                  {invitations.map((invitation) => (
                    <li
                      key={invitation.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{invitation.email}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {invitation.role.replaceAll('_', ' ')} · {invitation.status} · expires{' '}
                          {new Date(invitation.expiresAt).toLocaleString()}
                        </p>
                      </div>
                      {invitation.status === 'PENDING' && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void cancelInvitation(invitation)}
                          className="rounded-md border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50"
                        >
                          Cancel invitation
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {!canUpdate && (
            <p className="text-xs text-slate-500">
              Your role can view limited team details but cannot change roles, status, or branch
              assignments.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Notice({ message, tone }: { message: string; tone: 'error' | 'success' }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-lg border px-4 py-3 text-sm ${
        tone === 'error'
          ? 'border-red-200 bg-red-50 text-red-800'
          : 'border-emerald-200 bg-emerald-50 text-emerald-800'
      }`}
    >
      {message}
    </p>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
      <p className="text-sm text-slate-600">{message}</p>
    </div>
  );
}
