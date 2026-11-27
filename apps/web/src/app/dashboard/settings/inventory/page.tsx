'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import type { InventoryConnectionSummary, InventoryMappingConfiguration } from '@aicrm/shared';
import {
  ApiRequestError,
  createInventoryConnection,
  getInventoryConnections,
  setInventoryConnectionStatus,
  testInventoryConnection,
  updateInventoryConnection,
} from '../../../../lib/auth';
import { useDashboardSession } from '../../../../components/dashboard-session';
import { Permission } from '@aicrm/shared';

const blankMapping: InventoryMappingConfiguration = {
  tableName: 'vehicles',
  primaryKeyField: 'id',
  idField: 'id',
  makeField: 'make',
  modelField: 'model',
  variantField: null,
  yearField: 'year',
  registrationYearField: null,
  priceField: 'price',
  currencyField: null,
  mileageField: null,
  fuelTypeField: null,
  transmissionField: null,
  conditionField: null,
  bodyTypeField: null,
  colorField: null,
  availabilityField: null,
  descriptionField: null,
  imageUrlField: null,
  engineCapacityField: null,
  locationField: null,
  branchField: null,
  featuresField: null,
  serviceHistoryField: null,
  warrantyField: null,
  financeAvailabilityField: null,
  sourceUpdatedAtField: null,
};

export default function InventorySettingsPage() {
  const { user } = useDashboardSession();
  const canManage = user.permissions.includes(Permission.INVENTORY_INTEGRATION_MANAGE);
  const [connections, setConnections] = useState<InventoryConnectionSummary[]>([]);
  const [connection, setConnection] = useState<InventoryConnectionSummary | null>(null);
  const [host, setHost] = useState('');
  const [port, setPort] = useState('3306');
  const [databaseName, setDatabaseName] = useState('');
  const [username, setUsername] = useState('');
  const passwordInput = useRef<HTMLInputElement>(null);
  const [tlsEnabled, setTlsEnabled] = useState(true);
  const [tlsServername, setTlsServername] = useState('');
  const [mapping, setMapping] = useState<InventoryMappingConfiguration>(blankMapping);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!canManage) {
      setLoading(false);
      setError('Only a Dealer Admin can configure inventory connections.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const items = await getInventoryConnections();
      setConnections([...items]);
      const first = items[0] ?? null;
      setConnection(first);
      if (first) {
        setHost(first.host);
        setPort(String(first.port));
        setDatabaseName(first.databaseName);
        setUsername(first.username);
        setTlsEnabled(first.tlsEnabled);
        setTlsServername(first.tlsServername ?? '');
        setMapping(first.mapping ?? blankMapping);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load inventory settings.');
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const password = passwordInput.current?.value ?? '';
      if (passwordInput.current) passwordInput.current.value = '';
      const values = {
        name: connection?.name ?? 'Primary inventory',
        host,
        port: Number(port),
        databaseName,
        username,
        ...(password ? { password } : {}),
        tlsEnabled,
        tlsServername: tlsServername.trim() || null,
        mapping,
      };
      const saved = connection
        ? await updateInventoryConnection(connection.id, values)
        : await createInventoryConnection(values);
      setConnection(saved);
      setNotice('Inventory connection configuration saved as draft.');
      await load();
    } catch (cause) {
      setError(
        cause instanceof ApiRequestError ? cause.message : 'Unable to save inventory settings.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    if (!connection) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await testInventoryConnection(connection.id);
      setNotice(
        result.connected
          ? 'Connection test succeeded. The inventory mapping is accessible.'
          : 'Connection test failed.',
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Inventory connection test failed.');
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(status: 'ACTIVE' | 'INACTIVE') {
    if (!connection) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const saved = await setInventoryConnectionStatus(connection.id, status);
      setConnection(saved);
      setNotice(
        status === 'ACTIVE'
          ? 'Inventory connection activated.'
          : 'Inventory connection deactivated.',
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Unable to change inventory connection status.',
      );
    } finally {
      setSaving(false);
    }
  }

  function setMappingField(field: keyof InventoryMappingConfiguration, value: string) {
    setMapping((current) => ({
      ...current,
      [field]: value.trim() || null,
    }));
  }

  return (
    <div className="space-y-7">
      <header>
        <p className="text-sm font-semibold text-blue-700">Dealer administration</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-950">Inventory connection</h1>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {notice}
        </div>
      )}

      {loading ? (
        <p role="status" className="animate-pulse text-sm text-slate-500">
          Loading inventory settings…
        </p>
      ) : canManage ? (
        <form
          onSubmit={save}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <TextField label="Host" value={host} onChange={setHost} />
            <TextField label="Port" value={port} onChange={setPort} type="number" />
            <TextField label="Database name" value={databaseName} onChange={setDatabaseName} />
            <TextField label="Username" value={username} onChange={setUsername} />
            <label className="text-sm font-semibold text-slate-700">
              {connection ? 'Password (leave blank to keep existing)' : 'Password'}
              <input
                ref={passwordInput}
                type="password"
                autoComplete="new-password"
                className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 font-normal"
              />
            </label>
            <label className="flex h-10 items-end gap-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={tlsEnabled}
                onChange={(event) => setTlsEnabled(event.target.checked)}
              />
              Require TLS
            </label>
            <TextField
              label="TLS certificate hostname (for IP hosts)"
              value={tlsServername}
              onChange={setTlsServername}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Leave blank for DNS hosts. For a public IP address, enter the DNS name on the database
            certificate; certificate verification stays enabled.
          </p>

          <h2 className="mt-6 text-lg font-semibold text-slate-950">Schema mapping</h2>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            {[
              ['tableName', 'Table or view'],
              ['primaryKeyField', 'Primary key'],
              ['idField', 'Vehicle ID'],
              ['makeField', 'Make'],
              ['modelField', 'Model'],
              ['variantField', 'Variant'],
              ['yearField', 'Year'],
              ['registrationYearField', 'Registration year'],
              ['priceField', 'Price'],
              ['currencyField', 'Currency'],
              ['mileageField', 'Mileage'],
              ['fuelTypeField', 'Fuel type'],
              ['transmissionField', 'Transmission'],
              ['conditionField', 'Condition'],
              ['bodyTypeField', 'Body type'],
              ['colorField', 'Color'],
              ['availabilityField', 'Availability'],
              ['descriptionField', 'Description'],
              ['imageUrlField', 'Image URL'],
              ['engineCapacityField', 'Engine capacity'],
              ['locationField', 'Location'],
              ['branchField', 'Branch'],
              ['featuresField', 'Features'],
              ['serviceHistoryField', 'Service history'],
              ['warrantyField', 'Warranty'],
              ['financeAvailabilityField', 'Finance availability'],
              ['sourceUpdatedAtField', 'Source updated at'],
            ].map((entry) => {
              const [field, label] = entry as [string, string];
              return (
                <TextField
                  key={field}
                  label={label}
                  value={mapping[field as keyof InventoryMappingConfiguration] ?? ''}
                  onChange={(value) =>
                    setMappingField(field as keyof InventoryMappingConfiguration, value)
                  }
                />
              );
            })}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Save draft
            </button>
            {connection && (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void test()}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold"
                >
                  Test connection
                </button>
                {connection.status === 'ACTIVE' ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void changeStatus('INACTIVE')}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold"
                  >
                    Deactivate
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void changeStatus('ACTIVE')}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold"
                  >
                    Activate
                  </button>
                )}
              </>
            )}
          </div>

          {connection && (
            <p className="mt-5 text-sm text-slate-600">
              Status: <strong>{connection.status}</strong>
              {connection.lastSuccessfulConnectionAt
                ? ` · Last successful test: ${new Date(connection.lastSuccessfulConnectionAt).toLocaleString()}`
                : ' · Not successfully tested'}
            </p>
          )}
          {connections.length > 1 && (
            <p className="mt-2 text-xs text-slate-500">
              Multiple configurations are not supported in this view.
            </p>
          )}
        </form>
      ) : null}
    </div>
  );
}

function TextField({
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
    <label className="text-sm font-semibold text-slate-700">
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 font-normal"
      />
    </label>
  );
}
