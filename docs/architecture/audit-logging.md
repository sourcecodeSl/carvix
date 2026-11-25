# Audit Logging

## Event Model

Audit events are stored in the append-oriented `audit_events` PostgreSQL table.

Each event has:

- A server-generated UUID and server timestamp
- A tenant ID where the event is tenant-scoped
- Actor user and membership IDs derived from the authenticated server context
- A typed event name, category, action, resource, and outcome
- Optional request correlation, IP, and sanitized user-agent fields
- An allowlisted JSON metadata object with a maximum serialized size

Platform/pre-authentication events use a nullable tenant ID. Tenant APIs never accept a
tenant ID from the client and always derive the tenant scope from the verified active
membership.

## Event Taxonomy

Authentication events:

- `auth.login.success`
- `auth.login.failure`
- `auth.logout`
- `auth.tenant.switched`

Business events:

- `dealership.profile.updated`
- `branch.created`
- `branch.updated`
- `branch.activated`
- `branch.deactivated`
- `staff.invitation.created`
- `staff.invitation.cancelled`
- `staff.invitation.accepted`
- `staff.role.changed`
- `staff.membership.activated`
- `staff.membership.deactivated`
- `staff.branch_assignment.changed`

## Transaction Consistency

Successful dealership, branch, and staff mutations write their audit event inside the
same Prisma transaction as the business mutation. If that transaction rolls back, both
changes roll back together.

Login, logout, and tenant-switch events use an authentication audit function in the
restricted auth runtime. Authentication failure events do not associate a verified
tenant or actor unless one exists.

Authentication audit writes use `audit_record_auth_event`. Actor and tenant identities
are derived from the session-token hash by a trusted migration-owned SECURITY DEFINER
function. Frontend or authentication callers cannot supply actor or tenant IDs. The
function rejects unknown, revoked, or expired sessions and authorizes tenant switches
against active memberships.

## Integrity and Privacy

Normal application roles can insert and read tenant-scoped audit events, but are not
granted update or delete permissions on the audit table. PostgreSQL RLS restricts
tenant reads and writes. The implementation is append-oriented database logging, not
cryptographic tamper-proof storage.

Audit metadata is allowlisted. Passwords, session values, invitation tokens, cookies,
authorization headers, and raw request bodies are never stored.

Retention jobs and production SIEM/alert integrations are not implemented. Retention
policy and data disposition remain pending operational decisions.
