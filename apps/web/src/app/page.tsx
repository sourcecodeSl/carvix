import { CarFront } from 'lucide-react';
import { StatusDashboard } from '../components/status-dashboard';

export default function Home() {
  return (
    <main className="min-h-screen px-5 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <header className="mb-10 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-slate-950 text-white shadow-sm">
            <CarFront size={24} aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-blue-700">AI Car Sales Assistant</p>
            <p className="text-xs text-slate-500">Development foundation</p>
          </div>
        </header>

        <section className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
            <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
              AI Car Sales Assistant &amp; CRM
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">
              Multi-Tenant Automotive Sales Operations Platform
            </p>
            <StatusDashboard />
          </div>

          <aside className="rounded-2xl bg-slate-950 p-7 text-white shadow-sm sm:p-9">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-300">
              Technology stack
            </h2>
            <dl className="mt-6 grid gap-4 text-sm">
              {[
                ['Frontend', 'Next.js 16 / React 19'],
                ['Backend', 'NestJS 12 / TypeScript'],
                ['Database', 'PostgreSQL / Prisma'],
                ['Cache', 'Redis'],
                ['Monorepo', 'pnpm / Turborepo'],
                ['Infrastructure', 'Docker Compose'],
              ].map(([label, value]) => (
                <div key={label} className="border-b border-white/10 pb-4 last:border-0">
                  <dt className="text-slate-400">{label}</dt>
                  <dd className="mt-1 font-medium text-white">{value}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </section>
      </div>
    </main>
  );
}
