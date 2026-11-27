# CARVIX — Trial MySQL Inventory Integration Report

**Run date:** 2026-11-26  
**Environment:** Local development; synthetic fixture and disposable trial tenant only

## A. Trial database

- Compose service: `inventory-mysql`
- Database: `carvix_inventory_fixture`
- Table: `vehicles`
- Address: `127.0.0.1:3307`
- Reader: `carvix_inventory_reader`
- Password source: `INVENTORY_MYSQL_PASSWORD` in ignored local `.env.day3`; the value is not included here.
- Rows: 16 synthetic records. All IDs use the `SYN-` prefix and include the requested makes/models, one missing price, and one unknown availability.

Docker Engine access was denied by the local named-pipe permissions, so Docker could not report container health. The existing MySQL fixture was reachable on the approved local port, accepted the connector health query, and served the 16 actual fixture rows to the API. No Docker access workaround was attempted.

## B. Exact vehicle mapping

| Carvix field                                                                                                                                                       | Actual MySQL column | Required/optional                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- | ---------------------------------- |
| `tableName`                                                                                                                                                        | `vehicles`          | Required                           |
| `primaryKeyField`                                                                                                                                                  | `id`                | Required                           |
| `idField`                                                                                                                                                          | `id`                | Required                           |
| `makeField`                                                                                                                                                        | `make`              | Required                           |
| `modelField`                                                                                                                                                       | `model`             | Required                           |
| `variantField`                                                                                                                                                     | Not present; unset  | Optional                           |
| `yearField`                                                                                                                                                        | `year`              | Optional                           |
| `registrationYearField`                                                                                                                                            | Not present; unset  | Optional                           |
| `priceField`                                                                                                                                                       | `price_lkr`         | Optional; source cells can be NULL |
| `currencyField`                                                                                                                                                    | Not present; unset  | Optional                           |
| `mileageField`                                                                                                                                                     | `mileage`           | Optional                           |
| `fuelTypeField`                                                                                                                                                    | `fuel_type`         | Optional                           |
| `transmissionField`                                                                                                                                                | `transmission`      | Optional                           |
| `conditionField`                                                                                                                                                   | `condition_name`    | Optional                           |
| `bodyTypeField`                                                                                                                                                    | `body_type`         | Optional                           |
| `colorField`                                                                                                                                                       | `color`             | Optional                           |
| `availabilityField`                                                                                                                                                | `availability`      | Optional; source cells can be NULL |
| `descriptionField`                                                                                                                                                 | `description`       | Optional                           |
| `imageUrlField`                                                                                                                                                    | `image_urls`        | Optional                           |
| `engineCapacityField`, `locationField`, `branchField`, `featuresField`, `serviceHistoryField`, `warrantyField`, `financeAvailabilityField`, `sourceUpdatedAtField` | Not present; unset  | Optional                           |

The dealership is configured for LKR, but the source table has no currency column. API vehicle currency therefore remains `null`; no source currency is inferred.

## C. Connection status

The disposable tenant `carvix-trial-9e61f27e` uses a dedicated trial dealership. The configured connection `Carvix synthetic trial inventory` is **ACTIVE**. The live API saved it, returned no password or ciphertext, tested it, activated it, served fixture vehicles, deactivated it (vehicle listing returned 404), then retested and reactivated it.

Changing the mapping moved the connection out of its tested state; activation before retesting was rejected. The configuration was restored and the final valid connection remains ACTIVE.

**Resolved live API discrepancy:** The process originally listening on port 3001 returned success for a nonexistent optional column, while the current source integration test rejects it. The listener was identified behaviorally as the Carvix API (its login and inventory endpoints responded); Windows denied process metadata inspection. PID `11840` was stopped after the user authorized restarting that stale listener. The current source backend was started with `pnpm --filter @aicrm/api dev`; Nest reported zero compilation errors.

Against that restarted API, exact responses were:

| Workflow                                            | HTTP/result                                            |
| --------------------------------------------------- | ------------------------------------------------------ |
| Existing valid mapping: inventory list              | `200`, total 16                                        |
| Save mapping with `priceField=missing_price_column` | `200` (configuration saved as DRAFT)                   |
| Test invalid mapping                                | `503`, `The inventory mapping could not be applied.`   |
| Activate after failed test                          | `403`, `The inventory connection cannot be activated.` |
| List vehicles with invalid mapping state            | `404`                                                  |
| Restore valid mapping and test                      | `200` / `201`, connected                               |
| Activate restored mapping                           | `201`, status `ACTIVE`                                 |
| Final inventory list                                | `200`, total 16                                        |

The stale behavior came from the old API process, not the current source implementation. A regression assertion was added to the API integration test to require HTTP 403 activation denial after an invalid optional-column mapping fails its test.

## D. API verification

Live API login and inventory access succeeded for the disposable Dealer Admin. `GET /api/v1/inventory/vehicles` returned 16 rows from MySQL. Tested successfully: make/model/general search; price and year bounds; fuel, transmission and availability filters; sorting; pagination; combined filters; empty results; invalid query validation; valid detail lookup; and 404 for a nonexistent ID. Prices and years matched the fixture. The row with ID `SYN-MISSING-006` retained `price: null` and `availabilityStatus: null`.

The price-ascending response was confirmed numerically ordered after excluding the null price. No mock fallback was used.

## E. Frontend verification

The existing frontend returned HTTP 200 for `/dashboard/inventory` and `/dashboard/settings/inventory`; the web route integration tests also passed. Those checks establish that the pages are served, not that browser interactions work. Browser-driven login, filtering, pagination, details, settings save/test/activation, responsive layout, and loading/error/empty states remain **unverified**. A headless Chrome attempt failed before exposing a DevTools endpoint with `GPU process isn't usable. Goodbye.`; ports 9222, 9223 and 9224 did not provide CDP. Prior browser automation ended with a Chrome DevTools Protocol connection reset. Use the manual checklist below to complete the visual check.

## F. Security verification

- The reader’s grants were verified as database/table-scoped SELECT only; no administrative grants were present.
- SELECT succeeded. Direct INSERT, UPDATE and DELETE negative tests against this synthetic fixture were denied; no reader writes occurred.
- The Carvix connector integration confirmed read-only behavior, connection timeout behavior, and database-scoped access.
- The local fixture connection used `127.0.0.1:3307`; TLS was disabled only for this development fixture. Do not reuse this setting for production.
- The disposable trial tenant and Dealer Admin are separate from Example Dealership. The trial admin email is `carvix-trial-admin-9e61f27e@example.test`; its password is stored locally as `CARVIX_TRIAL_ADMIN_PASSWORD` in ignored `.env.day3` and is intentionally not printed.
- Audit metadata was checked against the fixture password and encrypted credential fields; no credential material was found.
- PostgreSQL integration tests for tenant isolation, RLS, RBAC, inventory API and audit consistency passed. No RLS setting was changed.

## G. Audit events

The trial tenant’s persisted events included `inventory.connection.created`, `inventory.connection.updated`, `inventory.connection.tested`, `inventory.connection.activated`, `inventory.connection.deactivated`, and `inventory.mapping.updated`. After the current API rejected the invalid mapping, its test event was recorded as a failure. No credential material appeared in metadata.

## H. Quality gates

| Gate                                                                       | Result                                                                                                           |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `pnpm db:generate`                                                         | PASS                                                                                                             |
| `pnpm db:validate`                                                         | PASS                                                                                                             |
| `pnpm typecheck`                                                           | PASS                                                                                                             |
| `pnpm lint`                                                                | PASS                                                                                                             |
| `pnpm format:check`                                                        | PASS                                                                                                             |
| `pnpm test` with PostgreSQL, MySQL and web route integration flags enabled | PASS — 78 passed, 0 skipped                                                                                      |
| `pnpm build`                                                               | Turbo reported 5 of 5 workspace tasks successful; command wrapper did not exit after summary and was interrupted |
| Current API inventory integration rerun                                    | PASS - 3 passed                                                                                                  |
| MySQL connector integration suite                                          | PASS - 20 passed                                                                                                 |
| Explicit inventory and audit integration rerun                             | PASS — 7 passed                                                                                                  |
| Prisma migration status                                                    | PASS — 26 migrations found, schema up to date                                                                    |

The full workspace suite after the regression assertion passed 78 tests with no skips. Targeted integration reruns are reported separately and are not added again to that total. Typecheck and lint passed after the test change. Turbo reported all five build tasks successful, but the command wrapper remained open after the summary and was interrupted; therefore its process exit was not clean. No applied migration was edited or rewritten.

## I. Changes made

- Added ten deterministic synthetic vehicles to `infrastructure/mysql/10-inventory-fixture.sql` using idempotent inserts; the fixture now contains 16 rows.
- Corrected the MySQL connector integration test to select the explicit NULL-price fixture row rather than assume it appears in the first six lexicographic IDs.
- Added an API regression assertion that activation is denied after an optional-column mapping fails its connection test.
- Stopped the stale API listener (PID `11840`) and launched the API from current source. Windows denied executable metadata inspection; stale behavior was confirmed by the Carvix API responses and corrected responses after restart. The Nest watch wrapper later failed to restart its child after the test-file change (`taskkill` access denied); the launched API child remained listening and healthy on port 3001.
- Created this report. Trial connection settings and test administrator details are in ignored local configuration; no secret values were added to tracked files.
- No PostgreSQL reset, Docker volume deletion, migration edit, commit, or push was performed.

## J. Manual connection instructions

1. Sign in at `http://127.0.0.1:3000/login` as `carvix-trial-admin-9e61f27e@example.test`. Read the password from local `CARVIX_TRIAL_ADMIN_PASSWORD` in ignored `.env.day3`; do not paste it into chat or source control.
2. Open `http://127.0.0.1:3000/dashboard/settings/inventory`.
3. Use these nonsecret connection values:
   - Type: MySQL
   - Host: `127.0.0.1`
   - Port: `3307`
   - Database: `carvix_inventory_fixture`
   - Username: `carvix_inventory_reader`
   - Password: local `INVENTORY_MYSQL_PASSWORD` from ignored `.env.day3`
   - TLS: disabled for this local development fixture only
4. Apply the mapping in section B. In particular, leave `currencyField` unset because no currency column exists.
5. Save, test, and activate. Confirm the response shows an active connection and that the dashboard lists the 16 synthetic rows. An invalid optional column should fail testing with HTTP 503 and activation with HTTP 403.

### Manual browser checklist

- Log in as the disposable Dealer Admin and open the inventory dashboard.
- Search for Toyota, Corolla, and Aqua; apply price, year, fuel, transmission and availability filters; try combined filters and pagination.
- Open a vehicle detail and confirm price/year match. Check `SYN-MISSING-006` keeps unknown price and availability blank/unknown.
- In Inventory Settings, confirm credentials are not rendered after saving; test and activate the mapping.
- Deactivate and confirm inventory access is blocked, then retest and reactivate if the trial session should remain usable.
- Check narrow/mobile layout and loading, empty and error states.

## K. Final verdict

| Check                        | Verdict                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| TRIAL MYSQL DATABASE CREATED | **YES** — existing isolated fixture populated with 16 synthetic records                           |
| MYSQL READ-ONLY VERIFIED     | **YES** — SELECT works; write attempts denied                                                     |
| CARVIX CONNECTION SUCCESSFUL | **YES** — valid mapping tested and ACTIVE                                                         |
| VEHICLE API VERIFIED         | **YES** — listing, search/filter, paging, sorting and details exercised against live fixture data |
| INVENTORY DASHBOARD VERIFIED | **NO** — page served and route tests pass, but browser interactions were not verified             |
| INVENTORY SETTINGS VERIFIED  | **NO** — page served, but browser interactions were not verified                                  |
| DAY 7 END-TO-END VERIFIED    | **NO** — live API mapping rejection now passes, but browser interactions remain unverified        |

**Docker limitation:** Docker Engine denied access to its named pipe; container health could not be queried. Existing local MySQL/API/web endpoints remained reachable and were tested without bypassing Docker permissions.
