'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, MapPinned, Pencil, Plus, ToggleLeft, ToggleRight, X } from 'lucide-react';
import { BranchStatus, Permission } from '@aicrm/shared';
import type { BranchResponse, DealershipResponse } from '@aicrm/shared';
import {
  ApiRequestError,
  createBranch,
  getBranches,
  getDealerships,
  updateBranch,
  updateBranchStatus,
} from '../../../lib/auth';
import { useDashboardSession } from '../../../components/dashboard-session';

type BranchDraft = {
  name: string;
  code: string;
  address: string;
  city: string;
  phone: string;
};

const blankDraft: BranchDraft = { name: '', code: '', address: '', city: '', phone: '' };

export default function BranchesPage() {
  const router = useRouter();
  const { user } = useDashboardSession();
  const canCreate = user.permissions.includes(Permission.BRANCH_CREATE);
  const canUpdate = user.permissions.includes(Permission.BRANCH_UPDATE);
  const [dealership, setDealership] = useState<DealershipResponse | null>(null);
  const [branches, setBranches] = useState<BranchResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [editingBranch, setEditingBranch] = useState<BranchResponse | null>(null);

  const loadBranches = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      if (!user.activeTenant) {
        setDealership(null);
        setBranches([]);
        return;
      }
      const dealerships = await getDealerships();
      if (dealerships.length > 1) {
        throw new Error(
          'Multiple dealership profiles were returned for a single-dealership workspace.',
        );
      }
      const activeDealership = dealerships[0] ?? null;
      setDealership(activeDealership);
      setBranches(activeDealership ? await getBranches(activeDealership.id) : []);
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.status === 401) {
        router.replace('/login');
        return;
      }
      setError(cause instanceof Error ? cause.message : 'Unable to load branches.');
    } finally {
      setLoading(false);
    }
  }, [router, user.activeTenant]);

  useEffect(() => {
    void loadBranches();
  }, [loadBranches]);

  function startCreate() {
    setEditingBranch(null);
    setFormMode('create');
    setError('');
    setNotice('');
  }

  function startEdit(branch: BranchResponse) {
    setEditingBranch(branch);
    setFormMode('edit');
    setError('');
    setNotice('');
  }

  function cancelForm() {
    setFormMode(null);
    setEditingBranch(null);
    setError('');
  }

  async function saveBranch(draft: BranchDraft) {
    if (!dealership) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (formMode === 'create') {
        await createBranch(dealership.id, {
          name: draft.name.trim(),
          code: draft.code.trim().toUpperCase(),
          address: draft.address.trim() || null,
          city: draft.city.trim() || null,
          phone: draft.phone.trim() || null,
        });
        setNotice('Branch created.');
      } else if (formMode === 'edit' && editingBranch) {
        await updateBranch(dealership.id, editingBranch.id, {
          name: draft.name.trim(),
          code: draft.code.trim().toUpperCase(),
          address: draft.address.trim() || null,
          city: draft.city.trim() || null,
          phone: draft.phone.trim() || null,
        });
        setNotice('Branch details saved.');
      } else {
        return;
      }
      setFormMode(null);
      setEditingBranch(null);
      await loadBranches();
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.status === 401) {
        router.replace('/login');
        return;
      }
      setError(cause instanceof Error ? cause.message : 'Unable to save this branch.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(branch: BranchResponse) {
    if (!dealership) return;
    const nextStatus =
      branch.status === BranchStatus.ACTIVE ? BranchStatus.INACTIVE : BranchStatus.ACTIVE;
    if (
      nextStatus === BranchStatus.INACTIVE &&
      !window.confirm(`Deactivate ${branch.name}? Its history will be retained.`)
    ) {
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const updated = await updateBranchStatus(dealership.id, branch.id, nextStatus);
      setBranches((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setNotice(nextStatus === BranchStatus.ACTIVE ? 'Branch reactivated.' : 'Branch deactivated.');
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.status === 401) {
        router.replace('/login');
        return;
      }
      setError(cause instanceof Error ? cause.message : 'Unable to update branch status.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <p role="status" className="animate-pulse rounded-xl bg-white p-6 text-sm text-slate-500">
        Loading branches…
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Dashboard
        </Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-blue-700">Locations</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">Branches</h1>
            {dealership && <p className="mt-2 text-sm text-slate-600">{dealership.businessName}</p>}
          </div>
          {dealership && canCreate && !formMode && (
            <button
              type="button"
              onClick={startCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <Plus size={17} aria-hidden="true" />
              Add branch
            </button>
          )}
        </div>
      </div>

      {error && <Notice tone="error" message={error} onRetry={() => void loadBranches()} />}
      {notice && <Notice tone="success" message={notice} />}

      {!user.activeTenant ? (
        <EmptyState
          title="Select an authorized workspace"
          description="Choose an active tenant membership before viewing branch information."
        />
      ) : !dealership ? (
        <EmptyState
          title="No dealership profile found"
          description="Create the dealership record for this existing tenant using the documented development bootstrap before managing branches."
        />
      ) : (
        <>
          {formMode && (
            <BranchForm
              key={editingBranch?.id ?? 'new'}
              mode={formMode}
              initial={editingBranch ? draftFrom(editingBranch) : blankDraft}
              saving={saving}
              error={error}
              onCancel={cancelForm}
              onSave={saveBranch}
            />
          )}

          {branches.length === 0 ? (
            <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-blue-50 text-blue-800">
                <MapPinned size={22} aria-hidden="true" />
              </span>
              <h2 className="mt-4 font-semibold text-slate-950">No branches yet</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">
                {canCreate
                  ? 'Add your first location to organize dealership operations.'
                  : 'There are no branches available for this dealership.'}
              </p>
              {canCreate && !formMode && (
                <button
                  type="button"
                  onClick={startCreate}
                  className="mt-5 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
                >
                  Add first branch
                </button>
              )}
            </section>
          ) : (
            <section
              aria-label="Branch list"
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="hidden grid-cols-[minmax(150px,1.3fr)_minmax(80px,0.5fr)_minmax(150px,1fr)_minmax(100px,0.7fr)_auto] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 md:grid">
                <span>Branch</span>
                <span>Code</span>
                <span>Location</span>
                <span>Status</span>
                <span className="text-right">Actions</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {branches.map((branch) => (
                  <li
                    key={branch.id}
                    className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(150px,1.3fr)_minmax(80px,0.5fr)_minmax(150px,1fr)_minmax(100px,0.7fr)_auto] md:items-center md:gap-4"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-950">{branch.name}</p>
                      <p className="mt-1 truncate text-sm text-slate-500">
                        {branch.phone ?? 'No phone provided'}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-slate-500 md:hidden">
                        Code ·{' '}
                      </span>
                      <span className="font-mono text-sm text-slate-700">{branch.code}</span>
                    </div>
                    <div className="text-sm text-slate-600">
                      {[branch.city, branch.address].filter(Boolean).join(' · ') ||
                        'No location provided'}
                    </div>
                    <div>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          branch.status === BranchStatus.ACTIVE
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {branch.status === BranchStatus.ACTIVE ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 md:justify-end">
                      {canUpdate && (
                        <>
                          <button
                            type="button"
                            onClick={() => startEdit(branch)}
                            disabled={saving}
                            aria-label={`Edit ${branch.name}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            <Pencil size={14} aria-hidden="true" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void toggleStatus(branch)}
                            disabled={saving}
                            aria-label={`${branch.status === BranchStatus.ACTIVE ? 'Deactivate' : 'Reactivate'} ${branch.name}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            {branch.status === BranchStatus.ACTIVE ? (
                              <ToggleLeft size={14} aria-hidden="true" />
                            ) : (
                              <ToggleRight size={14} aria-hidden="true" />
                            )}
                            {branch.status === BranchStatus.ACTIVE ? 'Deactivate' : 'Reactivate'}
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!canUpdate && (
            <p className="rounded-lg bg-white px-4 py-3 text-sm text-slate-600">
              Your role can view branches but cannot create, edit, or change their status.
            </p>
          )}
          {formMode === 'edit' && !editingBranch && (
            <p role="alert" className="text-sm text-red-700">
              The selected branch is no longer available.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function draftFrom(branch: BranchResponse): BranchDraft {
  return {
    name: branch.name,
    code: branch.code,
    address: branch.address ?? '',
    city: branch.city ?? '',
    phone: branch.phone ?? '',
  };
}

function BranchForm({
  mode,
  initial,
  saving,
  error,
  onCancel,
  onSave,
}: {
  mode: 'create' | 'edit';
  initial: BranchDraft;
  saving: boolean;
  error: string;
  onCancel: () => void;
  onSave: (draft: BranchDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState(initial);
  const prefix = mode === 'create' ? 'new' : 'edit';

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void onSave(draft);
      }}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
    >
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            {mode === 'create' ? 'Add branch' : 'Edit branch'}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Branch codes are unique within this dealership.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          aria-label="Close branch form"
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <Field
          id={`${prefix}-name`}
          label="Branch name"
          required
          maxLength={120}
          value={draft.name}
          onChange={(name) => setDraft({ ...draft, name })}
        />
        <Field
          id={`${prefix}-code`}
          label="Branch code"
          required
          maxLength={32}
          value={draft.code}
          onChange={(code) => setDraft({ ...draft, code: code.toUpperCase() })}
          hint="Letters, numbers, hyphens, and underscores."
        />
        <Field
          id={`${prefix}-address`}
          label="Address"
          maxLength={240}
          value={draft.address}
          onChange={(address) => setDraft({ ...draft, address })}
        />
        <Field
          id={`${prefix}-city`}
          label="City / region"
          maxLength={100}
          value={draft.city}
          onChange={(city) => setDraft({ ...draft, city })}
        />
        <Field
          id={`${prefix}-phone`}
          label="Branch phone"
          maxLength={40}
          value={draft.phone}
          onChange={(phone) => setDraft({ ...draft, phone })}
        />
      </div>
      {error && (
        <p role="alert" className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      <div className="mt-7 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving…' : mode === 'create' ? 'Create branch' : 'Save branch'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  required = false,
  maxLength,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  maxLength: number;
  hint?: string;
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-800">{label}</span>
      <input
        id={id}
        type="text"
        value={value}
        required={required}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
      />
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <h2 className="font-semibold text-slate-950">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">{description}</p>
      <Link
        href="/dashboard/dealership"
        className="mt-4 inline-block text-sm font-semibold text-blue-700 underline"
      >
        View dealership profile
      </Link>
    </section>
  );
}

function Notice({
  tone,
  message,
  onRetry,
}: {
  tone: 'error' | 'success';
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-lg border px-4 py-3 text-sm ${
        tone === 'error'
          ? 'border-red-200 bg-red-50 text-red-800'
          : 'border-emerald-200 bg-emerald-50 text-emerald-800'
      }`}
    >
      {message}
      {onRetry && (
        <button type="button" onClick={onRetry} className="ml-2 font-semibold underline">
          Retry
        </button>
      )}
    </div>
  );
}
