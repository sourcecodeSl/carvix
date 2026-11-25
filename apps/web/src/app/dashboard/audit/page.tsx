'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import type {
  AuditEventPageResponse,
  AuditEventResponse,
  AuditSummaryResponse,
} from '@aicrm/shared';
import { ApiRequestError, getAuditEvent, getAuditEvents, getAuditSummary } from '../../../lib/auth';
import { useDashboardSession } from '../../../components/dashboard-session';
import { Permission } from '@aicrm/shared';

const pageSize = 20;

export default function AuditPage() {
  const { user } = useDashboardSession();
  const canRead = user.permissions.includes(Permission.AUDIT_READ);
  const [events, setEvents] = useState<AuditEventPageResponse | null>(null);
  const [summary, setSummary] = useState<AuditSummaryResponse | null>(null);
  const [selected, setSelected] = useState<AuditEventResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [eventType, setEventType] = useState('');
  const [category, setCategory] = useState('');
  const [outcome, setOutcome] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const load = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      setError('You do not have permission to view activity logs.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const [pageResult, summaryResult] = await Promise.all([
        getAuditEvents({
          page,
          pageSize,
          ...(eventType ? { eventType } : {}),
          ...(category ? { category } : {}),
          ...(outcome ? { outcome } : {}),
          ...(startDate ? { startDate: `${startDate}T00:00:00.000Z` } : {}),
          ...(endDate ? { endDate: `${endDate}T23:59:59.999Z` } : {}),
        }),
        getAuditSummary({
          ...(startDate ? { startDate: `${startDate}T00:00:00.000Z` } : {}),
          ...(endDate ? { endDate: `${endDate}T23:59:59.999Z` } : {}),
        }),
      ]);
      setEvents(pageResult);
      setSummary(summaryResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load audit events.');
    } finally {
      setLoading(false);
    }
  }, [canRead, category, endDate, eventType, outcome, page, startDate]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetails(event: AuditEventResponse) {
    try {
      setSelected(await getAuditEvent(event.id));
    } catch (cause) {
      setError(cause instanceof ApiRequestError ? cause.message : 'Unable to load event details.');
    }
  }

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    void load();
  }

  const pageCount = Math.max(1, Math.ceil((events?.total ?? 0) / pageSize));

  return (
    <div className="space-y-7">
      <header>
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-800">
            <ScrollText size={21} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-blue-700">Security and activity</p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-950">Activity Logs</h1>
          </div>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      {canRead && (
        <>
          {summary && (
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ['Total events', summary.total],
                ['Successful logins', summary.successfulLogins],
                ['Access denied', summary.accessDenied],
                ['Branch modifications', summary.branchModifications],
              ].map(([label, value]) => (
                <article
                  key={String(label)}
                  className="rounded-xl border border-slate-200 bg-white p-4"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {label}
                  </p>
                  <p className="mt-2 text-2xl font-bold text-slate-950">{String(value)}</p>
                </article>
              ))}
            </section>
          )}

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <form onSubmit={submitFilters} className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              <label className="text-xs font-semibold text-slate-600">
                Event type
                <input
                  value={eventType}
                  onChange={(event) => setEventType(event.target.value)}
                  maxLength={128}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal"
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Category
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal"
                >
                  <option value="">All</option>
                  {[
                    'AUTHENTICATION',
                    'AUTHORIZATION',
                    'DEALERSHIP',
                    'BRANCH',
                    'STAFF',
                    'INVITATION',
                    'SECURITY',
                    'SYSTEM',
                  ].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Outcome
                <select
                  value={outcome}
                  onChange={(event) => setOutcome(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal"
                >
                  <option value="">All</option>
                  <option value="SUCCESS">Success</option>
                  <option value="FAILURE">Failure</option>
                  <option value="DENIED">Denied</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Start date
                <input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal"
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                End date
                <input
                  type="date"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal"
                />
              </label>
              <button
                type="submit"
                className="h-10 self-end rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white"
              >
                Apply
              </button>
            </form>

            {loading ? (
              <p role="status" className="mt-5 animate-pulse text-sm text-slate-500">
                Loading activity logs…
              </p>
            ) : !events?.items.length ? (
              <p className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                No audit events match these filters.
              </p>
            ) : (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-3">Event</th>
                      <th className="px-3 py-3">Date and time</th>
                      <th className="px-3 py-3">Actor</th>
                      <th className="px-3 py-3">Resource</th>
                      <th className="px-3 py-3">Outcome</th>
                      <th className="px-3 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.items.map((item) => (
                      <tr key={item.id} className="border-b border-slate-100">
                        <td className="px-3 py-3 font-medium text-slate-900">{item.eventType}</td>
                        <td className="px-3 py-3 text-slate-600">
                          {new Date(item.occurredAt).toLocaleString()}
                        </td>
                        <td className="px-3 py-3 text-slate-600">{item.actorName ?? 'System'}</td>
                        <td className="px-3 py-3 text-slate-600">
                          {item.resourceType}
                          {item.resourceId ? ` · ${item.resourceId.slice(0, 8)}` : ''}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-semibold ${item.outcome === 'DENIED' ? 'bg-red-50 text-red-700' : item.outcome === 'FAILURE' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}
                          >
                            {item.outcome}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => void openDetails(item)}
                            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold"
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {events && (
              <div className="mt-4 flex items-center justify-between">
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

          {selected && (
            <section
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              aria-label="Audit event details"
            >
              <div className="flex items-start justify-between gap-4">
                <h2 className="text-lg font-semibold text-slate-950">Event details</h2>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="text-sm font-semibold text-slate-500"
                >
                  Close
                </button>
              </div>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                {[
                  ['Event ID', selected.id],
                  ['Event type', selected.eventType],
                  ['Timestamp', new Date(selected.occurredAt).toLocaleString()],
                  ['Outcome', selected.outcome],
                  ['Actor', selected.actorName ?? 'System'],
                  [
                    'Resource',
                    `${selected.resourceType}${selected.resourceId ? ` · ${selected.resourceId}` : ''}`,
                  ],
                  ['Request ID', selected.requestId ?? 'Not available'],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {label}
                    </dt>
                    <dd className="mt-1 break-all text-sm text-slate-800">{value}</dd>
                  </div>
                ))}
              </dl>
              {selected.metadata && (
                <pre className="mt-4 max-h-48 overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
                  {JSON.stringify(selected.metadata, null, 2)}
                </pre>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
