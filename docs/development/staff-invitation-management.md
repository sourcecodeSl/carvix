# Staff and invitation management

Day 5 builds secure tenant staff management on the existing dealership, branch, tenant membership, authentication, and RLS foundation.

## Roles and permissions

| Role          | View staff | Invite | Update role/status | Assign branches |
| ------------- | ---------: | -----: | -----------------: | --------------: |
| Dealer Admin  |        Yes |    Yes |                Yes |             Yes |
| Sales Manager |    Limited |     No |                 No |              No |
| Sales Agent   |         No |     No |                 No |              No |

Staff response visibility follows permissions:

- Dealer Admin users can view staff emails.
- Sales Manager users can search names and view limited membership details, but email addresses are omitted.
- Sales Agent users cannot call staff-directory endpoints.
- A user cannot change their own role or membership status.
- The final active Dealer Administrator is protected by a tenant advisory lock and an active-admin recount.

## Invitations

Only Dealer Administrators can create or cancel invitations. Invite roles are intentionally limited to Sales Manager and Sales Agent; Dealer Admin cannot be assigned through the invitation API.

Invitation fields include a normalized email, role, SHA-256 token hash, expiration, lifecycle status, inviting membership, and selected branch assignments. The raw token exists only in the development preview URL fragment and is never persisted.

Local usage:

1. Open Staff as a Dealer Administrator.
2. Enter the staff email, role, and optional initial branch assignments.
3. Copy the returned local `/invite#<token>` preview link.
4. Open it in the browser.
5. Use the exact invited account for existing-user acceptance or create a new local account.

No email is sent. Production behavior is disabled unless a trusted email delivery and verification implementation replaces the development preview provider.

The public preview and resolver use a fixed-search-path SECURITY DEFINER helper. It performs format and lifecycle validation and returns only the invitation preview fields. It does not expose the raw token or membership credentials.

## Tenant and RLS isolation

The migration adds:

- `staff_invitations`
- `staff_invitation_branches`
- `staff_branch_assignments`
- tenant-aware composite foreign keys
- tenant RLS policies
- restricted runtime-role grants
- fixed-search-path SECURITY DEFINER helpers

Staff mutations run inside transactions after setting the transaction-local `app.tenant_id` and app role. RLS remains a second enforcement boundary. Missing tenant context yields no staff records.

The app runtime must not receive migration-owner credentials or superuser/BYPASSRLS privileges. Direct SELECT access to invitation tables and password credentials is not granted to public users.

## Branch assignments

Branch assignments are membership-scoped records that reference a membership and branch only within the same tenant.

- Non-admin branches are filtered by the active membership's assignment rows.
- A branch assignment is valid only for an active branch in the active tenant.
- Replacing assignments is transactional.
- Assignment selection is accepted only by the Dealer Administrator staff-update endpoint.
- Empty assignments are allowed and fail closed for branch-list visibility.

## Verification

Run migration validation and live integration tests:

```powershell
pnpm db:validate
pnpm --filter @aicrm/database exec prisma migrate status --config prisma.config.ts

$env:RUN_POSTGRES_INTEGRATION='true'
$env:DATABASE_URL=$env:DATABASE_MIGRATION_URL
pnpm test
```

Integration coverage verifies:

- Tenant directory isolation
- Role visibility
- Role/status/branch mutation authorization
- Final Dealer Admin protection
- Invitation hash storage
- Existing-account and new-account acceptance
- Replay, expiry, and cancellation
- Cross-origin CSRF rejection
- RLS fail-closed behavior
- Runtime role privileges and helper EXECUTE grants
