# MySQL inventory integration

The `@aicrm/inventory-mysql` package defines MySQL-only connection, mapping, validation, synchronization, and normalized vehicle contracts.

All external operations are read-only by design. Future implementations must use mysql2 pools with read-only accounts, TLS, allowlisted destinations, timeouts, limits, credential encryption or secret management, query allowlists, and tenant authorization.

No source field may be silently defaulted to an invented value. Missing mandatory facts must remain validation errors.
