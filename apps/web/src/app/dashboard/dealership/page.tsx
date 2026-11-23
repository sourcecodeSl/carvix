'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Building2, Pencil, Save, X } from 'lucide-react';
import { Permission } from '@aicrm/shared';
import type { DealershipResponse } from '@aicrm/shared';
import { ApiRequestError, getDealerships, updateDealership } from '../../../lib/auth';
import { useDashboardSession } from '../../../components/dashboard-session';

type DealershipForm = {
  businessName: string;
  contactEmail: string;
  contactPhone: string;
  country: string;
  timezone: string;
  currency: string;
};

const emptyForm: DealershipForm = {
  businessName: '',
  contactEmail: '',
  contactPhone: '',
  country: '',
  timezone: '',
  currency: '',
};

export default function DealershipPage() {
  const router = useRouter();
  const { user } = useDashboardSession();
  const canEdit = user.permissions.includes(Permission.DEALER_UPDATE);
  const [dealership, setDealership] = useState<DealershipResponse | null>(null);
  const [form, setForm] = useState<DealershipForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadDealership = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      if (!user.activeTenant) {
        setDealership(null);
        return;
      }
      const results = await getDealerships();
      if (results.length > 1) {
        throw new Error(
          'Multiple dealership profiles were returned for a single-dealership workspace.',
        );
      }
      const current = results[0] ?? null;
      setDealership(current);
      setForm(current ? formFrom(current) : emptyForm);
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.status === 401) {
        router.replace('/login');
        return;
      }
      setError(cause instanceof Error ? cause.message : 'Unable to load the dealership profile.');
    } finally {
      setLoading(false);
    }
  }, [router, user.activeTenant]);

  useEffect(() => {
    void loadDealership();
  }, [loadDealership]);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dealership) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const updated = await updateDealership(dealership.id, {
        businessName: form.businessName.trim(),
        contactEmail: form.contactEmail.trim(),
        contactPhone: form.contactPhone.trim() || null,
        country: form.country.trim(),
        timezone: form.timezone.trim(),
        currency: form.currency.trim().toUpperCase(),
      });
      setDealership(updated);
      setForm(formFrom(updated));
      setEditing(false);
      setSuccess('Dealership profile saved.');
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.status === 401) {
        router.replace('/login');
        return;
      }
      setError(cause instanceof Error ? cause.message : 'Unable to save the profile.');
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    setForm(dealership ? formFrom(dealership) : emptyForm);
    setEditing(false);
    setError('');
  }

  if (loading) return <PageState label="Loading dealership profile…" />;

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
            <p className="text-sm font-semibold text-blue-700">Business settings</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
              Dealership profile
            </h1>
          </div>
          {dealership && canEdit && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <Pencil size={16} aria-hidden="true" />
              Edit profile
            </button>
          )}
        </div>
      </div>

      {error && <Notice tone="error" message={error} onRetry={() => void loadDealership()} />}
      {success && <Notice tone="success" message={success} />}

      {!user.activeTenant ? (
        <EmptyState
          title="Select an authorized workspace"
          description="Choose an active tenant membership from the workspace selector before viewing dealership information."
        />
      ) : !dealership ? (
        <EmptyState
          title="No dealership profile found"
          description="This tenant does not have a dealership record yet. Use the documented development bootstrap to create one without creating another tenant."
        />
      ) : editing ? (
        <form
          onSubmit={saveProfile}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
        >
          <h2 className="mb-6 text-lg font-semibold text-slate-950">Edit business details</h2>
          <div className="grid gap-5 md:grid-cols-2">
            <TextField
              id="businessName"
              label="Dealership name"
              value={form.businessName}
              required
              maxLength={160}
              onChange={(value) => setForm({ ...form, businessName: value })}
            />
            <TextField
              id="contactEmail"
              label="Business email"
              type="email"
              value={form.contactEmail}
              required
              maxLength={254}
              onChange={(value) => setForm({ ...form, contactEmail: value })}
            />
            <TextField
              id="contactPhone"
              label="Business phone"
              value={form.contactPhone}
              maxLength={40}
              onChange={(value) => setForm({ ...form, contactPhone: value })}
            />
            <TextField
              id="country"
              label="Country"
              value={form.country}
              required
              maxLength={100}
              onChange={(value) => setForm({ ...form, country: value })}
            />
            <TextField
              id="timezone"
              label="Time zone"
              hint="Use an IANA time zone, for example Asia/Colombo."
              value={form.timezone}
              required
              maxLength={100}
              onChange={(value) => setForm({ ...form, timezone: value })}
            />
            <TextField
              id="currency"
              label="Currency code"
              hint="Three-letter currency code."
              value={form.currency}
              required
              maxLength={3}
              onChange={(value) => setForm({ ...form, currency: value.toUpperCase() })}
            />
          </div>
          <div className="mt-7 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save size={16} aria-hidden="true" />
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <X size={16} aria-hidden="true" />
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-6 flex items-center gap-3 border-b border-slate-100 pb-5">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-800">
              <Building2 size={21} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-slate-950">{dealership.businessName}</h2>
              <p className="text-sm text-slate-500">Authorized business profile</p>
            </div>
          </div>
          <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
            <Detail label="Business email" value={dealership.contactEmail} />
            <Detail label="Business phone" value={dealership.contactPhone ?? 'Not provided'} />
            <Detail label="Country" value={dealership.country} />
            <Detail label="Time zone" value={dealership.timezone} />
            <Detail label="Currency" value={dealership.currency} />
            <Detail label="Last updated" value={new Date(dealership.updatedAt).toLocaleString()} />
          </dl>
          {!canEdit && (
            <p className="mt-7 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Your role can view this profile but cannot edit it.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function formFrom(dealership: DealershipResponse): DealershipForm {
  return {
    businessName: dealership.businessName,
    contactEmail: dealership.contactEmail,
    contactPhone: dealership.contactPhone ?? '',
    country: dealership.country,
    timezone: dealership.timezone,
    currency: dealership.currency,
  };
}

function TextField({
  id,
  label,
  value,
  onChange,
  required = false,
  maxLength,
  type = 'text',
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  maxLength: number;
  type?: string;
  hint?: string;
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-800">{label}</span>
      <input
        id={id}
        type={type}
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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-slate-950">{value}</dd>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <h2 className="font-semibold text-slate-950">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">{description}</p>
    </section>
  );
}

function PageState({ label }: { label: string }) {
  return (
    <p role="status" className="animate-pulse rounded-xl bg-white p-6 text-sm text-slate-500">
      {label}
    </p>
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
