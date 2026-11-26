# MySQL inventory integration

## Source of truth and contracts

The dealership's MySQL database is the sole source of vehicle information. Carvix reads
inventory on demand and does not create a shadow inventory or write vehicle data back to
the dealership. Missing price, availability, currency, specifications, or images remain
unknown (`null`); the API does not substitute defaults. Required mapping identifiers,
make, and model columns must be configured. Optional mappings cover variant, registration
year, price/currency, mileage, fuel, transmission, condition, body type, color,
availability, description, images, engine capacity, location, branch, features, service
history, warranty, finance availability, and source update time.

SQL identifiers are validated and quoted. Search values and paging values are bound
parameters. The connector accepts only SELECT statements and rejects multi-statement
separators, comments, DML/DDL tokens, `SELECT ... INTO`, and `LOAD_FILE`. This check is
defense in depth; it does not replace least-privilege MySQL grants.

## Connection security

Before opening a pool, the connector validates the destination at connection time. The
only development/test exception is the literal IPv4 tuple
`127.0.0.1:3307/carvix_inventory_fixture`, enabled by server configuration. It performs
no DNS lookup for this tuple; `localhost`, IPv6 loopback, alternate ports, private DNS
names, and other fixture databases are rejected. Public request fields cannot enable the
fixture exception. Production accepts globally routable public destinations only and
rejects private, loopback, link-local, shared, multicast, documentation, and special-use
IPv4/IPv6 addresses. Every DNS answer is checked and the connector pins its TCP socket to
one vetted answer, preventing a second DNS lookup from rebinding the connection.

DNS checks inside an application are not a substitute for network-layer egress policy.
Production deployments must also restrict outbound database traffic to approved
dealership endpoints or an approved proxy, and deny cloud metadata, private, link-local,
loopback, and internal service networks. Such production firewall rules have not been
verified as deployed by this repository.

Production connections require TLS with certificate-chain and hostname verification.
Each operation uses its own tenant-scoped MySQL pool, capped at five sockets. A
process-wide connector gate permits at most eight active pools and queues at most sixteen
additional operations for up to 30 seconds. It rejects excess work and releases the gate
when each pool closes. Connect and query timeouts are clamped to 500–30,000 ms.
Connections are released in `finally` blocks and pools close after each operation.

Each connector checks `SHOW GRANTS FOR CURRENT_USER()` before data access. The account
must have `USAGE` and `SELECT` on the configured database only. Broader grants, roles,
write privileges, and global SELECT are rejected. The development fixture SQL removes
the default database grants and grants SELECT only to its reader account.

Connection passwords are encrypted using AES-256-GCM before storage. The key is the
32-byte hexadecimal `INVENTORY_CREDENTIAL_ENCRYPTION_KEY` environment variable; there is
no fixed development fallback. The setup generator creates this key in the ignored API
environment file without printing it. Passwords and ciphertext are excluded from API
responses and audit metadata. Keep the key in a secret manager for production. Key
rotation and re-encryption are not yet implemented; maintain the key until a controlled
rotation workflow is added.

## Tenant and permission boundaries

`inventory_connections` belongs to both one tenant and that tenant's dealership. A
composite foreign key prevents mismatched tenant/dealership IDs. Forced PostgreSQL RLS
uses the transaction-local `app.tenant_id`; repository operations derive the tenant from
the authenticated principal and scope every query. Connection management requires
`INVENTORY_INTEGRATION_MANAGE` (Dealer Admin); vehicle reads require `INVENTORY_READ`.
Client-provided tenant IDs are not accepted by inventory routes.

## Events and operations

Connection create/update, connection tests, activation/deactivation, and mapping changes
write audit events in the same PostgreSQL transaction as the corresponding state change.
Events contain resource IDs and allowlisted state/change metadata only. They never
contain connection passwords, encryption material, or raw SQL.

Every configuration write increments `configuration_revision` and clears prior test
success. Test results are recorded only when their captured revision still matches the
stored revision. Activation locks the connection row and checks that the last successful
test revision matches the current revision, so an in-flight test or configuration write
cannot authorize stale settings. The additive revision migration does not change earlier
migrations.

The isolated synthetic fixture is defined in
`infrastructure/mysql/10-inventory-fixture.sql`. Start only the MySQL service with the
existing project and environment file; do not remove volumes to reinitialize it:

```powershell
docker compose --env-file .env.day3 --project-name aicrm-day3-clean up -d inventory-mysql
```

The fixture uses synthetic `SYN-*` records, including one intentionally missing price.
The SQL initialization script runs only when its MySQL volume is first initialized; for
an existing volume, verify effective grants with `SHOW GRANTS` instead of assuming that
the initialization script reran.

Tests requiring real databases must set `RUN_POSTGRES_INTEGRATION=true` and
`RUN_MYSQL_INTEGRATION=true` with the local PostgreSQL and synthetic fixture configured.
The fixture credentials are read from ignored local environment files and must never be
copied into source or reports. Test setup may insert disposable PostgreSQL fixtures but
does not reset the database or issue writes to a dealership MySQL database.
