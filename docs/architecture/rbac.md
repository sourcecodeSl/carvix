# Role-Based Access Control

Day 2 defines centralized permissions and role mappings in `@aicrm/shared`.

## Dealer roles

- `DEALER_ADMIN`: dealership and branch management, employee management, sales operations, inventory read, reports, and subscriptions read.
- `SALES_MANAGER`: sales operations, assigned work, appointments, reports, and inventory/lead access.
- `SALES_AGENT`: restricted lead, conversation, inventory, dealership, branch, and appointment access.

## Platform role

- `SUPER_ADMIN`: explicit platform dealership create/read/update permissions only.

The platform role does not inherit tenant permissions and must not automatically gain customer conversation access. Support access elevation remains a future auditable workflow.

Frontend visibility is not authorization. Backend permission checks and tenant context are mandatory for protected operations.
