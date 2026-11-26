# CARVIX — DAY 7 FINAL CORRECTION REPORT

## Summary

Day 7's existing uncommitted implementation was continued in place. The destination
policy, stale connection-test race, schema mapping check, connector concurrency cap,
integration coverage, documentation, and verification setup were corrected. No commit or
push was made. No earlier applied migration was edited.

## Problems fixed

- Development/test MySQL access is restricted to literal `127.0.0.1:3307` and the
  synthetic `carvix_inventory_fixture` database. The connector does not resolve this
  literal, and it pins the socket to the validated address.
- Production DNS answers are all checked before the socket is pinned. Production TLS
  still requires certificate-chain and hostname verification.
- A process-wide gate limits work to eight active tenant-scoped connector pools and
  sixteen queued operations. Queue and MySQL connect/query timeouts are bounded, and
  `close()` releases connector capacity once.
- Inventory configuration writes increment `configuration_revision` and invalidate
  earlier successful tests. Results update only the revision they tested. Activation
  locks the row and verifies the successful test revision in the same transaction.
- Connection tests now select every configured mapping column, catch missing tables or
  columns including optional configured fields, and check required vehicle identity
  values when the source contains a record. Missing source values remain null.
- Search now rejects filters or price sorting unsupported by the selected mapping.
- The inventory settings route and dashboard route both pass local HTTP route smoke
  tests. The old verified Next dev process was stopped and a fresh one returned HTTP 200
  for both paths.
- Generated Prisma whitespace findings are handled reproducibly: Prettier ignores
  generated Prisma files, and `.gitattributes` exempts only generator-added trailing
  spaces in that directory. Next's generated `next-env.d.ts` is ignored by Prettier and
  its initial contents were restored after the build.

## Files changed in this correction

- API inventory service, repository, and PostgreSQL/MySQL integration coverage under
  `apps/api/src/modules/inventory/`.
- Staff integration setup under `apps/api/src/modules/staff/staff.integration.spec.ts`
  now isolates its Redis rate-limit test state.
- MySQL destination validation, pool gate, timeout handling, and unit/fixture tests under
  `packages/inventory-mysql/src/`.
- Prisma inventory revision fields, generated client output, and the additive
  `20261126120000_inventory_configuration_revision` migration.
- The local inventory route test, architecture/report documentation, README, and
  formatting attributes/ignore rules.
- All other pre-existing Day 7 and earlier uncommitted files remain preserved.

## Security and MySQL verification

- Unit tests cover the approved fixture tuple, alternate loopback ports, private
  addresses, IPv6, public DNS validation, mixed safe/unsafe production DNS answers,
  SELECT-only grants, timeout sanitization, and pool capacity/cleanup.
- The isolated MySQL fixture suite passed with `RUN_MYSQL_INTEGRATION=true`. It verified
  the live reader account's effective grants, successful SELECT access, read-only query
  rejection, missing source price preservation, and query timeout behavior.
- API integration passed against the synthetic MySQL fixture, including complete mapping
  validation, invalid optional and required columns, credential redaction, vehicle search
  and details, activation/deactivation, paging/sorting, and audit consistency.
- Development fixture exceptions are selected by server configuration and an exact
  destination/database tuple; no request field can enable them.
- Application-level checks do not provide production egress isolation by themselves.
  Production network rules must allow only approved database destinations and deny
  metadata, private, loopback, link-local, and internal networks. Deployment of those
  rules was not verified here; see [MySQL integration architecture](../architecture/mysql-integration.md).

## Revision and mapping regression results

- The PostgreSQL regression captured a test revision, updated the configuration before
  recording the old result, and confirmed that the result was rejected and activation
  remained blocked. A current-revision success then activated and deactivated correctly.
- The API/MySQL integration tested nonexistent required and optional source columns. Both
  test attempts failed, the invalid mapping could not activate, and the corrected mapping
  passed.
- Missing price and availability source facts remained null in API responses and the
  dashboard contract.

## Database and migration status

- Active database: `aicrm_day3_clean`.
- 26 local migrations and 26 successful applied migrations; zero checksum mismatches.
- Prisma migration status is up to date. The database-to-schema diff is empty.
- The two-column `20261126120000_inventory_configuration_revision` migration is additive
  and applied. It adds the configuration and tested revisions plus consistency checks.
- `inventory_connections` has RLS enabled and forced with one tenant-scoped USING/WITH
  CHECK policy. The scoped `aicrm_app` role has SELECT, INSERT, and UPDATE and no DELETE;
  the runtime role can assume that scoped role.
- No database reset, volume deletion, or edit to an applied migration was performed.

## Routes and interactive UI verification

- A clean Next dev server served `/dashboard/inventory` and
  `/dashboard/settings/inventory` with HTTP 200. The explicit web route suite passed both
  cases and does not count authentication redirects as success.
- The enabled API integration suite signed in Dealer Admin, Manager, and Agent test users
  through the API. It verified Dealer Admin inventory management, Manager/Agent read
  permissions, Tenant A/B isolation, and real MySQL fixture interaction.
- Interactive Chrome verification was attempted using a temporary synthetic Dealer Admin
  and isolated browser profile. Chrome accepted the local DevTools handshake but reset
  the debugging connection when a page command was sent, so the browser-driven sign-in,
  form interaction, and visual dashboard workflow could not be completed. The exact
  temporary database rows and browser profile were cleaned up. No credentials were
  printed. HTTP route and API integration verification passed independently.

## Quality gates and tests

| Check                                                 |                                 Final result |
| ----------------------------------------------------- | -------------------------------------------: |
| `pnpm db:generate`                                    |                                 PASS, exit 0 |
| `pnpm db:validate`                                    |                                 PASS, exit 0 |
| `pnpm typecheck`                                      |                                 PASS, exit 0 |
| `pnpm lint`                                           |                                 PASS, exit 0 |
| `pnpm format:check`                                   |                                 PASS, exit 0 |
| `pnpm test` (integration flags off)                   |                51 passed, 27 skipped, exit 0 |
| `pnpm build`                                          |  PASS, exit 0; both inventory routes emitted |
| Enabled PostgreSQL/MySQL/API monorepo tests           | 76 passed, 2 web-route tests skipped, exit 0 |
| Web route smoke with `RUN_WEB_ROUTE_INTEGRATION=true` |                  2 passed, 0 skipped, exit 0 |
| `git diff --check`                                    |                                 PASS, exit 0 |

The 27 default skips are database, MySQL, API, and web route integration tests gated by
environment flags. With PostgreSQL and MySQL flags enabled, all database and API tests
ran; only the two web-route cases remained skipped and were run separately. The final
enabled run included 41 API tests, 5 database tests, 20 MySQL package tests, 7 shared
tests, and 3 web tests. An earlier run exposed a mistaken Tenant B expectation and a
shared Redis counter in a Day 5 integration fixture; both test issues were corrected,
then the full enabled run passed. The Day 5 test now uses an isolated Redis test double.

## Remaining limitations and readiness

- Browser-driven interaction remains unverified because the local Chrome DevTools
  connection reset during automation. Route HTTP behavior and API integration are
  verified.
- Production egress firewall rules were not verified as deployed. Production must add
  those deployment controls before external dealership connections are enabled.
- Docker Compose inspection remains unavailable in this environment. The isolated MySQL
  fixture was reachable and its read-only behavior was exercised directly.
- No commits or pushes were made. Earlier uncommitted Day 1–7 work remains preserved.

**DAY 7 IMPLEMENTATION COMPLETE: YES**  
**DAY 7 SECURITY VERIFIED: YES — application policies and fixture tests; deployment egress remains unverified**  
**DAY 7 READY TO COMMIT: NO — browser-driven Dealer Admin interaction remains unverified**  
**DAY 8 READY: NO**
