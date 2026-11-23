# AI Car Sales Assistant & CRM

This repository is a Day 1 foundation for a multi-tenant automotive sales operations and CRM platform.

## Technology stack

- Next.js 16 and React 19 frontend
- NestJS 12 and TypeScript backend
- PostgreSQL 18 with Prisma 7
- Redis 8
- pnpm workspaces and Turborepo
- Docker Compose
- Vitest

## Workspace structure

- `apps/web`: Next.js App Router frontend
- `apps/api`: NestJS REST API
- `packages/database`: Prisma schema and PostgreSQL client
- `packages/shared`: shared API contracts
- `packages/inventory-mysql`: MySQL inventory integration contracts
- `docs/`: architecture, development, and decision records

## Prerequisites

- Node.js 24 or compatible supported runtime
- pnpm 11
- Docker Desktop or Docker Engine for local infrastructure
- Git

## Setup

```powershell
pnpm install
Copy-Item .env.example .env
docker compose up -d postgres redis
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Use `.env.example` only as safe development configuration. Never commit real secrets.

## Local URLs

- Frontend: http://127.0.0.1:3000
- Backend: http://127.0.0.1:3001
- Health: http://127.0.0.1:3001/api/v1/health
- Readiness: http://127.0.0.1:3001/api/v1/health/ready
- Swagger: http://127.0.0.1:3001/docs

## Common commands

```powershell
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm format
pnpm format:check
pnpm db:generate
pnpm db:migrate
pnpm db:validate
docker compose logs --tail=100 postgres redis
docker compose down
```

## API

`GET /api/v1/health` is a liveness check and does not verify dependencies.

`GET /api/v1/health/ready` verifies PostgreSQL and Redis. It returns HTTP 503 when either dependency is unavailable.

## Day 1 status

Day 1 implemented the monorepo, frontend foundation, NestJS API, Prisma tenant/user schema, Redis readiness support, MySQL inventory contracts, Docker configuration, tests, CI configuration, and architecture documentation.

Docker migration and live readiness success require Docker infrastructure. Authentication, CRM, inventory synchronization, workers, AI, and WhatsApp are intentionally deferred.

## Next milestone

Day 2 must add authentication and authorization only after tenant resolution, session, password, audit, and RLS designs are reviewed.
