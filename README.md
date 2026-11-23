# AI Car Sales Assistant & CRM

This repository provides a foundation for a multi-tenant automotive sales operations and CRM platform.

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
node infrastructure/postgres/create-local-config.mjs
docker compose --env-file .env.day3 --project-name aicrm-day3-clean up -d postgres redis
pnpm db:generate
pnpm --filter @aicrm/database exec prisma migrate deploy --config prisma.config.ts
pnpm dev
```

The config generator creates ignored local files with random credentials. The API receives only runtime database URLs; Prisma and the explicit development-user provisioning command use the separate migration URL. Never commit local environment files or secrets.

See [local setup](docs/development/local-setup.md) for database configuration and [Day 3 database archive and recovery](docs/development/day3-database-archive.md) for the preserved legacy database and backup.

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
pnpm db:validate
pnpm --filter @aicrm/database exec prisma migrate deploy --config prisma.config.ts
docker compose --env-file .env.day3 --project-name aicrm-day3-clean logs --tail=100 postgres redis
docker compose --env-file .env.day3 --project-name aicrm-day3-clean down
```

Use `prisma migrate dev` only when intentionally authoring a new migration. Never edit an applied migration; create an additive migration for corrections.

## API

`GET /api/v1/health` is a liveness check and does not verify dependencies.

`GET /api/v1/health/ready` verifies PostgreSQL and Redis. It returns HTTP 503 when either dependency is unavailable.

## Project foundation status

The project includes the monorepo, frontend foundation, NestJS API, Prisma database configuration, Redis readiness support, MySQL inventory contracts, Docker infrastructure, CI configuration, tenant and dealership models, branch and membership structures, explicit platform administration, centralized permissions, PostgreSQL RLS policies, Argon2id password credentials, opaque server-side sessions, secure authentication cookies, login/logout, tenant selection, and protected frontend routes.

Employee invitations, CRM leads, AI, inventory synchronization, workers, WhatsApp, and deployment infrastructure remain outside the current foundation scope.

## Dealership and branch management

The API and UI use the existing dealership and branch schema. Endpoints, permission rules, RLS transaction behavior, and the explicit development bootstrap are documented in [dealership and branch management](docs/development/dealership-branch-management.md).

## Next milestone

The next milestone can build on the verified dealership and branch foundation.
