# Day 3 database archive and recovery

## Why the original development database was archived

The original local database (`aicrm` in `ai-car-sales-crm-postgres-1`) had two applied migration sources whose current SHA-256 values do not match `_prisma_migrations`:

| Migration                                       | Recorded checksum prefix | Current source prefix |
| ----------------------------------------------- | ------------------------ | --------------------- |
| `20261123070000_runtime_role_separation`        | `b35e5b`                 | `c849df`              |
| `20261123140000_auth_helper_execute_correction` | `d29fba`                 | `cfd3d4`              |

The original SQL bytes could not be recovered from Git, local stashes, dangling Git objects, session records, or available backups. The exact historical migration changes are therefore unknown. No historical migration file or `_prisma_migrations` row was rewritten, and the original database history was not repaired.

The old database contained a small set of user, tenant, dealership, membership, and credential rows. The owner confirmed those rows were test data. The old PostgreSQL container and volume were left in place and unchanged; a separate clean environment is now active.

## Verified backups

The database backup is outside the repository at:

`C:\Users\User\.copilot\session-state\4c52e30e-c155-4e16-a80a-dfbf3ea74454\files\day3-dev-aicrm-20261123.dump`

- Created with PostgreSQL 18.1 `pg_dump -Fc`.
- Size: 42,518 bytes.
- SHA-256: `529652c44e81f9df77df00b48b8dede7da50302eda4102da1786cb4d963d7db7`.
- `pg_restore --list` validation passed.

A separate PostgreSQL `pg_dumpall --globals-only` snapshot is stored beside it as `day3-dev-aicrm-globals-20261123.sql`. It includes role metadata and password hashes; keep it private and do not commit it.

## New clean development environment

- Compose project: `aicrm-day3-clean`.
- PostgreSQL database: `aicrm_day3_clean`, bound to `127.0.0.1:55433`.
- Redis: bound to `127.0.0.1:6380`.
- PostgreSQL volume: `aicrm-day3-clean_postgres-data`.
- Redis volume: `aicrm-day3-clean_redis-data`.

The old PostgreSQL volume is `ai-car-sales-crm_postgres-data`; the new PostgreSQL volume is distinct. The environment is configured by ignored local files created with:

```powershell
node infrastructure/postgres/create-local-config.mjs
docker compose --env-file .env.day3 --project-name aicrm-day3-clean up -d postgres redis
pnpm --filter @aicrm/database exec prisma migrate deploy --config prisma.config.ts
```

The provisioning script creates both runtime login roles before migrations. All 13 current migrations applied successfully to the new database. The source checksums match the new database ledger, there are no unresolved failures, and Prisma reports the schema up to date. This validates the current source on a clean database; it does not repair or reclassify the old database's checksum history.

## Restoring the archived database safely

Restore only into a separately named database or isolated PostgreSQL project. Do not restore over either the old database or `aicrm_day3_clean`.

For example, to restore into a separate database on the new local PostgreSQL instance:

```powershell
docker exec aicrm-day3-clean-postgres-1 createdb -U aicrm -T template0 aicrm_archive_restore
docker cp "C:\Users\User\.copilot\session-state\4c52e30e-c155-4e16-a80a-dfbf3ea74454\files\day3-dev-aicrm-20261123.dump" aicrm-day3-clean-postgres-1:/tmp/aicrm-archive.dump
docker exec aicrm-day3-clean-postgres-1 pg_restore --exit-on-error --no-owner --no-acl --username aicrm --dbname aicrm_archive_restore /tmp/aicrm-archive.dump
```

This restores the archived schema and data into a new database. The restored `_prisma_migrations` records retain the original checksum history; restore does not fix those mismatches. The globals snapshot is only for a separately isolated server restore and must not be replayed into the active clean server.

## Preventing future migration checksum drift

- Treat every applied `migration.sql` as immutable.
- Make schema and permission corrections in a new, timestamped additive migration.
- Use `prisma migrate deploy` to apply committed migrations to development or production databases.
- Never edit `_prisma_migrations` manually or alter a migration checksum to make status appear clean.
- Before release, compare applied migration checksums against the exact source files and verify on a fresh isolated database.
