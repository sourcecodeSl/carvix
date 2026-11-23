'use client';

import { useEffect, useState } from 'react';
import type { ApiHealthResponse, ApiReadinessResponse } from '@aicrm/shared';
import type { BackendStatus } from '../lib/status';

export function StatusDashboard() {
  const [status, setStatus] = useState<BackendStatus>('loading');
  const [health, setHealth] = useState<ApiHealthResponse | null>(null);
  const [readiness, setReadiness] = useState<ApiReadinessResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

    Promise.all([
      fetch(`${apiBaseUrl}/api/v1/health`, { signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error('Health check failed');
        return response.json() as Promise<ApiHealthResponse>;
      }),
      fetch(`${apiBaseUrl}/api/v1/health/ready`, { signal: controller.signal }).then(
        async (response) => {
          const payload = (await response.json()) as ApiReadinessResponse;
          if (!response.ok && payload.status !== 'not_ready')
            throw new Error('Readiness check failed');
          return payload;
        },
      ),
    ])
      .then(([healthPayload, readinessPayload]) => {
        setHealth(healthPayload);
        setReadiness(readinessPayload);
        setStatus('connected');
      })
      .catch(() => setStatus('disconnected'));

    return () => controller.abort();
  }, []);

  const label =
    status === 'loading'
      ? 'Checking backend'
      : status === 'connected'
        ? 'Backend connected'
        : 'Backend unavailable';

  return (
    <div className="mt-8 grid gap-3 sm:grid-cols-3" aria-live="polite">
      <StatusCard title="Project foundation" value="Day 1 foundation" tone="neutral" />
      <StatusCard title="Frontend status" value="Running" tone="success" />
      <StatusCard
        title={label}
        value={health?.timestamp ?? readiness?.timestamp ?? 'Waiting for API'}
        tone={status === 'connected' ? 'success' : status === 'disconnected' ? 'error' : 'neutral'}
      />
      {readiness && (
        <StatusCard
          title="Backend readiness"
          value={
            readiness.status === 'ready' ? 'PostgreSQL and Redis ready' : 'Dependency unavailable'
          }
          tone={readiness.status === 'ready' ? 'success' : 'error'}
        />
      )}
    </div>
  );
}

function StatusCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: string;
  tone: 'success' | 'error' | 'neutral';
}) {
  const dot =
    tone === 'success' ? 'bg-emerald-500' : tone === 'error' ? 'bg-red-500' : 'bg-slate-400';

  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      </div>
      <p className="mt-2 text-sm font-medium text-slate-800">{value}</p>
    </article>
  );
}
