# Runtime role provisioning

The active local environment uses the `aicrm-day3-clean` Compose project and a separate `aicrm_day3_clean` database. Its PostgreSQL volume is project-scoped and is not the archived `aicrm` volume.

1. `node infrastructure/postgres/create-local-config.mjs` generates random, ignored credentials in `.env.day3`, `packages/database/.env`, and `apps/api/.env`. It refuses to overwrite existing files.
2. `docker compose --env-file .env.day3 --project-name aicrm-day3-clean up -d postgres` initializes PostgreSQL and runs `infrastructure/postgres/20-provision-runtime-roles.sh`.
3. The bootstrap script requires explicit `POSTGRES_PASSWORD`, `AICRM_AUTH_PASSWORD`, and `AICRM_APP_PASSWORD` values. It has LF line endings and does not contain credential defaults.
4. The bootstrap creates login roles `aicrm_auth_runtime` and `aicrm_app_runtime` before migrations.
5. Prisma uses only `DATABASE_MIGRATION_URL` from `packages/database/.env`. The Prisma config does not fall back to `DATABASE_URL`.
6. Applied migrations create non-login permission roles, restricted grants, helper functions, and RLS policies.
7. The API reads only `DATABASE_AUTH_URL` and `DATABASE_APP_URL` from `apps/api/.env`. Its configuration schema does not accept a migration URL.

The migration owner is reserved for schema migrations and the explicitly invoked development-user provisioning operation. Never place its URL in the API environment or expose it to API runtime services. Local environment files are ignored by Git.

For exact migration results and the preserved legacy database, see [Day 3 database archive and recovery](day3-database-archive.md).
