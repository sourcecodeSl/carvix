# Local setup

The active Day 3 development environment uses a dedicated Compose project, PostgreSQL database, data volume, and Redis instance. It does not reuse the archived `aicrm` database or its volume.

1. Run `pnpm install`.
2. Generate ignored local credentials and configuration:

   ```powershell
   node infrastructure/postgres/create-local-config.mjs
   ```

   This creates `.env.day3`, `apps/api/.env`, and `packages/database/.env`. The first file configures Compose, the API file contains only authentication and tenant runtime URLs, and the database package file contains the migration URL plus an optional isolated shadow URL. The generator does not print credentials and refuses to overwrite existing files.

3. Start the isolated local services:

   ```powershell
   docker compose --env-file .env.day3 --project-name aicrm-day3-clean up -d postgres redis
   ```

   PostgreSQL is available at `127.0.0.1:55433` as `aicrm_day3_clean`; Redis is available at `127.0.0.1:6380`. Compose creates project-specific volumes.

4. Generate the Prisma client and apply immutable migrations:

   ```powershell
   pnpm db:generate
   pnpm --filter @aicrm/database exec prisma migrate deploy --config prisma.config.ts
   ```

5. Start the API and frontend with `pnpm dev`.

The API does not require or receive migration-owner credentials. Use the separate migration URL only for Prisma commands and the explicitly invoked local user-provisioning script. Do not copy it into `apps/api/.env`.

To provision a local development user, load the migration URL only for that command:

```powershell
$migrationLine = Get-Content packages/database/.env | Where-Object { $_ -like 'DATABASE_MIGRATION_URL=*' }
$env:DATABASE_MIGRATION_URL = $migrationLine.Substring('DATABASE_MIGRATION_URL='.Length)
pnpm --filter @aicrm/api provision:user -- --email user@example.test --name "Development User" --tenant example-dealership --role DEALER_ADMIN
Remove-Item Env:DATABASE_MIGRATION_URL
```

The script requires a hidden password prompt and refuses to run outside development mode. The API server process itself never receives the migration URL.

To create a dealership profile for an existing active tenant that has none, use the explicit, repeatable bootstrap below. It does not create a tenant and leaves an existing dealership unchanged:

```powershell
pnpm --filter @aicrm/api provision:dealership -- `
  --tenant <existing-tenant-slug> `
  --name "Example Dealership" `
  --email <business-contact-email> `
  --country "Sri Lanka" `
  --timezone "Asia/Colombo" `
  --currency LKR
```

Add `--phone` if a business phone is available. The bootstrap is development-only and restricted to `aicrm_day3_clean` on port 55433. See [dealership and branch management](dealership-branch-management.md) for endpoints, authorization, and validation rules.

Stop services without deleting their data:

```powershell
docker compose --env-file .env.day3 --project-name aicrm-day3-clean down
```

Never add `-v` unless you deliberately intend to remove the new development volumes. The archived database and its backup are documented in [Day 3 database archive and recovery](day3-database-archive.md).
