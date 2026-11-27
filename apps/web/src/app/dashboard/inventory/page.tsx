'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { PackageSearch } from 'lucide-react';
import {
  Permission,
  vehicleSortOptions,
  type VehicleFilterCapability,
  type VehicleDetails,
  type VehicleSearchFilters,
  type VehicleSearchResult,
} from '@aicrm/shared';
import { ApiRequestError, getVehicle, getVehicles } from '../../../lib/auth';
import { useDashboardSession } from '../../../components/dashboard-session';

const filterFields = [
  ['q', 'Search make, model, variant or vehicle ID'],
  ['make', 'Make'],
  ['model', 'Model'],
  ['minPrice', 'Minimum price', 'price'],
  ['maxPrice', 'Maximum price', 'price'],
  ['minYear', 'Minimum year', 'year'],
  ['maxYear', 'Maximum year', 'year'],
  ['minMileage', 'Minimum mileage', 'mileage'],
  ['maxMileage', 'Maximum mileage', 'mileage'],
  ['fuelType', 'Fuel type', 'fuelType'],
  ['transmission', 'Transmission', 'transmission'],
  ['condition', 'Condition', 'condition'],
  ['bodyType', 'Body type', 'bodyType'],
  ['availability', 'Availability', 'availability'],
] as const satisfies readonly (readonly [
  keyof VehicleSearchFilters,
  string,
  VehicleFilterCapability?,
])[];

const sortLabels = {
  newest: 'Default order',
  priceAsc: 'Price: low to high',
  priceDesc: 'Price: high to low',
  yearAsc: 'Year: oldest first',
  yearDesc: 'Year: newest first',
  mileageAsc: 'Mileage: low to high',
  mileageDesc: 'Mileage: high to low',
  makeAsc: 'Make: A to Z',
  makeDesc: 'Make: Z to A',
};

export default function InventoryPage() {
  const { user } = useDashboardSession();
  const canManage = user.permissions.includes(Permission.INVENTORY_INTEGRATION_MANAGE);
  const [result, setResult] = useState<VehicleSearchResult | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleDetails | null>(null);
  const [detailsLoadingId, setDetailsLoadingId] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState('');
  const detailsRef = useRef<HTMLElement | null>(null);
  const detailsLoading = detailsLoadingId !== null;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState<URLSearchParams | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [capabilities, setCapabilities] = useState<VehicleSearchResult['supportedFilters']>([]);

  useEffect(() => {
    function readLocation() {
      const params = new URLSearchParams(window.location.search);
      setDraft(Object.fromEntries(params));
      setApplied(params);
    }
    readLocation();
    window.addEventListener('popstate', readLocation);
    return () => window.removeEventListener('popstate', readLocation);
  }, []);

  useEffect(() => {
    if (!applied) return;
    const request = new AbortController();
    setLoading(true);
    setError('');
    setResult(null);
    // Keep the URL's raw values so the API can validate malformed shared links.
    const filters = new URLSearchParams();
    for (const key of [...filterFields.map(([key]) => key), 'sort', 'page', 'pageSize']) {
      for (const value of applied.getAll(key)) filters.append(key, value);
    }
    void getVehicles(filters, request.signal).then(
      (response) => {
        if (request.signal.aborted) return;
        setResult(response);
        setCapabilities(response.supportedFilters);
        setLoading(false);
      },
      (cause: unknown) => {
        if (request.signal.aborted) return;
        setError(inventoryError(cause));
        setLoading(false);
      },
    );
    return () => {
      request.abort();
    };
  }, [applied]);

  function navigate(params: URLSearchParams) {
    const query = params.toString();
    window.history.pushState(null, '', query ? `?${query}` : window.location.pathname);
    setApplied(params);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams(applied ?? undefined);
    params.delete('page');
    for (const [key] of filterFields) {
      const value = draft[key]?.trim();
      if (value) params.set(key, value);
      else params.delete(key);
    }
    navigate(params);
  }

  function changeOption(key: 'sort' | 'pageSize' | 'page', value: string) {
    const params = new URLSearchParams(applied ?? undefined);
    if (key !== 'page') params.delete('page');
    params.set(key, value);
    navigate(params);
  }

  useEffect(() => {
    if (detailsLoading || detailsError || selectedVehicle) {
      detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [detailsError, detailsLoading, selectedVehicle]);

  async function showDetails(vehicleId: string) {
    setDetailsLoadingId(vehicleId);
    setDetailsError('');
    setSelectedVehicle(null);
    try {
      setSelectedVehicle(await getVehicle(vehicleId));
    } catch (cause) {
      setDetailsError(cause instanceof Error ? cause.message : 'Unable to load vehicle details.');
    } finally {
      setDetailsLoadingId(null);
    }
  }

  const page = result?.page ?? 1;
  const pageCount = result?.totalPages ?? 0;

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-800">
            <PackageSearch size={21} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-blue-700">External dealership source</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">Inventory</h1>
          </div>
        </div>
        {canManage && (
          <Link
            href="/dashboard/settings/inventory"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold"
          >
            Connection settings
          </Link>
        )}
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          {filterFields.map(
            ([key, label, capability]: readonly [string, string, VehicleFilterCapability?]) =>
              (!capability || capabilities.includes(capability)) && (
                <FilterInput
                  key={key}
                  label={label}
                  value={draft[key] ?? ''}
                  onChange={(value) => setDraft((previous) => ({ ...previous, [key]: value }))}
                  type={key.startsWith('min') || key.startsWith('max') ? 'number' : 'text'}
                  step={capability === 'price' ? '0.01' : '1'}
                />
              ),
          )}
          <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
            <button
              type="submit"
              className="h-10 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white"
            >
              Apply search and filters
            </button>
            <button
              type="button"
              className="h-10 rounded-lg border px-3 text-sm"
              onClick={() => {
                setDraft((previous) => ({ ...previous, q: '' }));
                const params = new URLSearchParams(applied ?? undefined);
                params.delete('q');
                params.delete('page');
                navigate(params);
              }}
            >
              Clear search
            </button>
            <button
              type="button"
              className="h-10 rounded-lg border px-3 text-sm"
              onClick={() => {
                setDraft({});
                navigate(new URLSearchParams());
              }}
            >
              Reset filters
            </button>
          </div>
        </form>

        <div className="mt-5 flex flex-wrap gap-4 text-sm">
          <label>
            Sort by
            <select
              className="ml-2 rounded-lg border p-2"
              value={applied?.get('sort') ?? 'newest'}
              onChange={(event) => changeOption('sort', event.target.value)}
            >
              {vehicleSortOptions
                .filter(
                  (sort) =>
                    (sort.startsWith('price') && capabilities.includes('price')) ||
                    (sort.startsWith('year') && capabilities.includes('year')) ||
                    (sort.startsWith('mileage') && capabilities.includes('mileage')) ||
                    sort === 'newest' ||
                    sort.startsWith('make'),
                )
                .map((sort) => (
                  <option key={sort} value={sort}>
                    {sortLabels[sort]}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Page size
            <select
              className="ml-2 rounded-lg border p-2"
              value={applied?.get('pageSize') ?? '20'}
              onChange={(event) => changeOption('pageSize', event.target.value)}
            >
              {[10, 20, 50, 100].map((size) => (
                <option key={size}>{size}</option>
              ))}
            </select>
          </label>
        </div>
        {result && (
          <p role="status" className="mt-4 text-sm text-slate-600">
            {result.total} matching vehicles
          </p>
        )}

        {loading ? (
          <p role="status" className="mt-5 animate-pulse text-sm text-slate-500">
            Loading inventory…
          </p>
        ) : error ? null : !result?.items.length ? (
          <p className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
            No vehicle inventory records match these filters.
          </p>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {result.items.map((vehicle) => (
              <article key={vehicle.id} className="rounded-xl border border-slate-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {vehicle.make ?? 'Make not provided'} · {vehicle.model ?? 'Model not provided'}
                </p>
                <h2 className="mt-2 text-lg font-semibold text-slate-950">
                  {vehicle.year ?? 'Year not provided'}
                </h2>
                <p className="mt-2 text-sm text-slate-700">
                  {vehicle.price == null
                    ? 'Price not provided'
                    : `${vehicle.currency ?? ''} ${vehicle.price}`.trim()}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {vehicle.availabilityStatus ?? 'Availability not provided'}
                </p>
                <dl className="mt-2 space-y-1 text-sm text-slate-600">
                  {(
                    [
                      ['Mileage', vehicle.mileage],
                      ['Fuel type', vehicle.fuelType],
                      ['Transmission', vehicle.transmission],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="flex gap-2">
                      <dt>{label}</dt>
                      <dd>{value ?? 'Not provided'}</dd>
                    </div>
                  ))}
                </dl>
                <button
                  type="button"
                  disabled={detailsLoading}
                  onClick={() => void showDetails(vehicle.id)}
                  className="mt-4 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:cursor-wait disabled:opacity-60"
                >
                  {detailsLoadingId === vehicle.id ? 'Loading details…' : 'View vehicle details'}
                </button>
              </article>
            ))}
          </div>
        )}

        {result && (
          <div className="mt-5 flex items-center justify-between">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => changeOption('page', String(page - 1))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-slate-500">
              {pageCount ? `Page ${page} of ${pageCount}` : `Page ${page}`}
            </span>
            <button
              type="button"
              disabled={page >= pageCount}
              onClick={() => changeOption('page', String(page + 1))}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </section>

      {(detailsLoading || detailsError || selectedVehicle) && (
        <section
          ref={detailsRef}
          tabIndex={-1}
          className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm focus:outline-none"
          aria-live="polite"
        >
          {detailsLoading && <p role="status">Loading vehicle details…</p>}
          {detailsError && (
            <p role="alert" className="text-sm text-red-700">
              {detailsError}
            </p>
          )}
          {selectedVehicle && (
            <>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">
                    External inventory record
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-slate-950">
                    {[
                      selectedVehicle.year,
                      selectedVehicle.make,
                      selectedVehicle.model,
                      selectedVehicle.variant,
                    ]
                      .filter((value) => value !== null && value !== undefined)
                      .join(' ') || 'Vehicle details'}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedVehicle(null)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  Close
                </button>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {[
                  [
                    'Price',
                    selectedVehicle.price == null
                      ? null
                      : `${selectedVehicle.currency ?? ''} ${selectedVehicle.price}`.trim(),
                  ],
                  ['Availability', selectedVehicle.availabilityStatus],
                  ['Mileage', selectedVehicle.mileage],
                  ['Fuel type', selectedVehicle.fuelType],
                  ['Transmission', selectedVehicle.transmission],
                  ['Condition', selectedVehicle.condition],
                  ['Registration year', selectedVehicle.registrationYear],
                  ['Engine capacity', selectedVehicle.engineCapacity],
                  ['Color', selectedVehicle.color],
                  ['Location', selectedVehicle.location],
                  ['Branch', selectedVehicle.branch],
                  ['Warranty', selectedVehicle.warranty],
                  ['Service history', selectedVehicle.serviceHistory],
                  ['Finance availability', selectedVehicle.financeAvailability],
                  ['Features', selectedVehicle.features?.join(', ') ?? null],
                  ['Source updated', selectedVehicle.sourceUpdatedAt],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <dt className="font-semibold text-slate-600">{label}</dt>
                    <dd className="mt-1 text-slate-900">{value ?? 'Not provided by source'}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">
                {selectedVehicle.description ?? 'No description provided by source.'}
              </p>
              {selectedVehicle.imageUrls.some(isSafeHttpUrl) && (
                <ul className="mt-3 list-inside list-disc text-sm text-blue-700">
                  {selectedVehicle.imageUrls.filter(isSafeHttpUrl).map((url) => (
                    <li key={url}>
                      <a href={url} target="_blank" rel="noreferrer">
                        View source image
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-4 text-xs text-slate-500">
                Retrieved {new Date(selectedVehicle.retrievedAt).toLocaleString()}; inventory values
                come from the dealership source.
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function inventoryError(cause: unknown): string {
  if (cause instanceof ApiRequestError) {
    if (cause.status === 401) return 'Your session has expired. Sign in again to view inventory.';
    if (cause.status === 403) return 'You do not have permission to view inventory.';
    if (cause.status === 404 || cause.status === 503) return cause.message;
    if (cause.status === 400) return cause.message;
  }
  return 'Unable to load inventory. Please try again.';
}

function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function FilterInput({
  label,
  value,
  onChange,
  type = 'text',
  step,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'number';
  step?: string;
}) {
  return (
    <label className="text-xs font-semibold text-slate-600">
      {label}
      <input
        type={type}
        step={type === 'number' ? step : undefined}
        min={type === 'number' ? 0 : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal"
      />
    </label>
  );
}
