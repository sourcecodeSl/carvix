# Dealership and branch management

Staff branch visibility is extended by Day 5: Sales Managers and Sales Agents only receive branch rows assigned to their active tenant membership. Dealer Administrators retain tenant-wide branch management permissions.

Day 4 uses the existing `dealerships` and `branches` tables. No schema migration is required:

- Each tenant has at most one dealership.
- A branch references both its dealership and tenant through a composite foreign key.
- Branch codes are trimmed, uppercased, and unique within a dealership. Branch names are not unique.
- Deactivation and reactivation update `BranchStatus`; records are never hard-deleted.
- Only fields represented by the existing schema are editable. Website, description, and branch contact email are not part of this contract.

## Authorization

Every endpoint requires a valid session and an active tenant membership. The server derives the tenant from the authenticated session and membership, never from request data. Tenant-scoped queries run in a transaction after setting the `aicrm_app` role and transaction-local `app.tenant_id`; PostgreSQL RLS remains a second isolation layer.

| Role                                                    | View dealership and branches | Edit dealership profile | Create branch | Edit / activate / deactivate branch |
| ------------------------------------------------------- | ---------------------------: | ----------------------: | ------------: | ----------------------------------: |
| `DEALER_ADMIN`                                          |                          Yes |                     Yes |           Yes |                                 Yes |
| `SALES_MANAGER`                                         |                          Yes |                      No |            No |                                  No |
| `SALES_AGENT`                                           |                          Yes |                      No |            No |                                  No |
| Platform administrator without active tenant membership |         No dealer API bypass |                      No |            No |                                  No |

Unauthorized cross-tenant resource IDs return 404. Missing sessions return 401; insufficient permissions return 403. Mutations retain the existing origin-based CSRF guard.

## API contract

All responses omit the tenant ownership field. IDs in nested routes identify resources only; they do not grant access.

| Method  | Route                                                         | Permission      | Purpose                                                                  |
| ------- | ------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------ |
| `GET`   | `/api/v1/dealerships`                                         | `DEALER_READ`   | List the active tenant's dealership (zero or one).                       |
| `GET`   | `/api/v1/dealerships/:dealershipId`                           | `DEALER_READ`   | Read a dealership profile.                                               |
| `PATCH` | `/api/v1/dealerships/:dealershipId`                           | `DEALER_UPDATE` | Update business name, email, phone, country, timezone, or currency.      |
| `GET`   | `/api/v1/dealerships/:dealershipId/branches`                  | `BRANCH_READ`   | List branches in stable name/code/ID order.                              |
| `POST`  | `/api/v1/dealerships/:dealershipId/branches`                  | `BRANCH_CREATE` | Create an active branch under the authorized dealership.                 |
| `GET`   | `/api/v1/dealerships/:dealershipId/branches/:branchId`        | `BRANCH_READ`   | Read one branch belonging to that dealership.                            |
| `PATCH` | `/api/v1/dealerships/:dealershipId/branches/:branchId`        | `BRANCH_UPDATE` | Update name, code, address, city, or phone. Ownership cannot be changed. |
| `PATCH` | `/api/v1/dealerships/:dealershipId/branches/:branchId/status` | `BRANCH_UPDATE` | Activate or deactivate a branch without deleting history.                |

Request DTOs reject unknown ownership and role fields. Duplicate branch codes return 409. Invalid UUIDs, emails, time zones, statuses, and overlong values return 400.

## Development dealership bootstrap

The database may have an existing tenant but no dealership. To seed only the dealership for an existing active tenant, explicitly run the development-only, idempotent bootstrap:

```powershell
pnpm --filter @aicrm/api provision:dealership -- `
  --tenant <existing-tenant-slug> `
  --name "Example Dealership" `
  --email <business-contact-email> `
  --country "Sri Lanka" `
  --timezone "Asia/Colombo" `
  --currency LKR
```

`--phone` is optional. The command uses the migration URL only for this explicit provisioning action and refuses to run unless that URL targets `aicrm_day3_clean` on port 55433. It does not create a tenant and never overwrites an existing dealership. If the tenant slug is unknown, inspect existing tenant slugs locally:

```powershell
docker exec aicrm-day3-clean-postgres-1 psql -U aicrm -d aicrm_day3_clean -At -c "SELECT slug FROM tenants ORDER BY created_at;"
```

Do not use this bootstrap against the archived database or a production database.

## Verification

The HTTP integration suite runs against the clean database when `RUN_POSTGRES_INTEGRATION=true` and verifies real login/session handling, role authorization, CRUD persistence, tenant isolation, RLS behavior, foreign-key constraints, CSRF, validation, and cleanup. For the API runtime, load only `DATABASE_AUTH_URL` and `DATABASE_APP_URL`; use `DATABASE_MIGRATION_URL` only in the test/provisioning process.
