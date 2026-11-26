'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { PackageSearch } from 'lucide-react';
import { Permission, type VehicleDetails, type VehicleSearchResult } from '@aicrm/shared';
import { getVehicle, getVehicles } from '../../../lib/auth';
import { useDashboardSession } from '../../../components/dashboard-session';

export default function InventoryPage() {
  const { user } = useDashboardSession();
  const canManage = user.permissions.includes(Permission.INVENTORY_INTEGRATION_MANAGE);
  const [result, setResult] = useState<VehicleSearchResult | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [query, setQuery] = useState('');
  const [fuelType, setFuelType] = useState('');
  const [transmission, setTransmission] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [minYear, setMinYear] = useState('');
  const [maxYear, setMaxYear] = useState('');
  const [availability, setAvailability] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setResult(
        await getVehicles({
          page,
          pageSize: 20,
          ...(query ? { q: query } : {}),
          ...(make ? { make } : {}),
          ...(model ? { model } : {}),
          ...(fuelType ? { fuelType } : {}),
          ...(transmission ? { transmission } : {}),
          ...(minPrice ? { minPrice } : {}),
          ...(maxPrice ? { maxPrice } : {}),
          ...(minYear ? { minYear: Number(minYear) } : {}),
          ...(maxYear ? { maxYear: Number(maxYear) } : {}),
          ...(availability ? { availability } : {}),
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load inventory.');
    } finally {
      setLoading(false);
    }
  }, [
    availability,
    fuelType,
    make,
    maxPrice,
    maxYear,
    minPrice,
    minYear,
    model,
    page,
    query,
    transmission,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
  }

  async function showDetails(vehicleId: string) {
    setDetailsLoading(true);
    setDetailsError('');
    setSelectedVehicle(null);
    try {
      setSelectedVehicle(await getVehicle(vehicleId));
    } catch (cause) {
      setDetailsError(cause instanceof Error ? cause.message : 'Unable to load vehicle details.');
    } finally {
      setDetailsLoading(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil((result?.total ?? 0) / 20));

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
          <FilterInput label="Search make or model" value={query} onChange={setQuery} />
          <FilterInput label="Make" value={make} onChange={setMake} />
          <FilterInput label="Model" value={model} onChange={setModel} />
          <FilterInput
            label="Minimum price"
            value={minPrice}
            onChange={setMinPrice}
            type="number"
          />
          <FilterInput
            label="Maximum price"
            value={maxPrice}
            onChange={setMaxPrice}
            type="number"
          />
          <FilterInput label="Availability" value={availability} onChange={setAvailability} />
          <FilterInput label="Fuel type" value={fuelType} onChange={setFuelType} />
          <FilterInput label="Transmission" value={transmission} onChange={setTransmission} />
          <button
            type="submit"
            className="h-10 self-end rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white"
          >
            Apply
          </button>
          <FilterInput label="Minimum year" value={minYear} onChange={setMinYear} type="number" />
          <FilterInput label="Maximum year" value={maxYear} onChange={setMaxYear} type="number" />
        </form>

        {loading ? (
          <p role="status" className="mt-5 animate-pulse text-sm text-slate-500">
            Loading inventory…
          </p>
        ) : !result?.items.length ? (
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
                <button
                  type="button"
                  onClick={() => void showDetails(vehicle.id)}
                  className="mt-4 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
                >
                  View vehicle details
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
              onClick={() => setPage((value) => value - 1)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-slate-500">
              Page {page} of {pageCount}
            </span>
            <button
              type="button"
              disabled={page >= pageCount}
              onClick={() => setPage((value) => value + 1)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </section>

      {(detailsLoading || detailsError || selectedVehicle) && (
        <section
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'number';
}) {
  return (
    <label className="text-xs font-semibold text-slate-600">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal"
      />
    </label>
  );
}
