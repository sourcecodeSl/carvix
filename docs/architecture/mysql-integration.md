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

SQL identifiers are validated and quoted. Search and paging values use server-side prepared
statement parameters. The connector disables the MySQL local-file capability, accepts only
SELECT statements for inventory, and rejects multi-statement
separators, comments, DML/DDL tokens, `SELECT ... INTO`, and `LOAD_FILE`. This check is
defense in depth; it does not replace least-privilege MySQL grants.

## Connection security

Before opening a pool, the connector validates the destination at connection time. The
only development/test exception is the literal IPv4 tuple
`127.0.0.1:3307/carvix_inventory_fixture`, enabled by server configuration. It performs
no DNS lookup for this tuple; `localhost`, IPv6 loopback, alternate ports, private DNS
names, and other fixture databases are rejected. Public request fields cannot enable the
fixture exception. Production accepts public DNS hostnames and globally routable IPv4 and IPv6 literals and
rejects private, loopback, link-local, shared, multicast, documentation, and special-use
IPv4/IPv6 addresses. Every DNS answer is checked and the connector pins its TCP socket to
one vetted answer, preventing a second DNS lookup from rebinding the connection.

DNS checks inside an application are not a substitute for network-layer egress policy.
Production deployments must also restrict outbound database traffic to approved
dealership endpoints or an approved proxy, and deny cloud metadata, private, link-local,
loopback, and internal service networks. Such production firewall rules have not been
verified as deployed by this repository.

Production connections require TLS 1.2 or newer with certificate-chain and hostname verification.
DNS endpoints use their configured public hostname as the TLS server name. A literal
public IP can be used as the pinned TCP destination only when the administrator also
sets the DNS name present on that database certificate. The TLS socket verifies that
name while the custom TCP stream still connects to the vetted IP. IP-only certificate
SAN verification is not supported by the current mysql2 TLS interface; use a provider
DNS endpoint or a DNS certificate name for IP connections.
Each operation uses its own tenant-scoped MySQL pool, capped at five sockets. A
process-wide connector gate permits at most eight active pools and queues at most sixteen
additional operations for up to 30 seconds. It rejects excess work and releases the gate
when each pool closes. DNS, MySQL authentication, and prepared query execution have deadlines.
Connect and query timeouts are clamped to 500–30,000 ms.
Connections are released in `finally` blocks and pools close after each operation.

The connector uses Node.js's default trust store. For a provider CA approved for the entire
API deployment, mount a trusted PEM file read-only and set `NODE_EXTRA_CA_CERTS` before
starting the Node process. That setting extends trust for the entire process, so only
deployment operators should manage the bundle. Tenant-specific private roots require a
per-connection reference to a deployment-managed CA bundle. A future implementation can
load the referenced bundle server-side and pass it as `ssl.ca` while retaining certificate
and hostname verification. [Node.js CA configuration](https://nodejs.org/api/cli.html#node_extra_ca_certsfile)

The connector checks `SHOW GRANTS` on the session before data access, including mandatory
roles. The account may have global `USAGE` and must have direct `SELECT` on the configured
database or explicitly named tables or views within it. Broader grants, roles, write
privileges, global SELECT, and `WITH GRANT OPTION` are rejected. In production, prefer a
table or view grant when the database name contains `_`, since MySQL may treat that character
as a wildcard in a schema-level grant unless escaped. The development fixture SQL removes
the default database grants and grants SELECT only to its reader account.
[MySQL grant syntax](https://dev.mysql.com/doc/refman/8.0/en/grant.html)

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

## Inventory search API

Use `GET /api/v1/inventory/vehicles` with a dealership session that has inventory read permission. The session determines the dealership and the active connection.

| Parameters                                                           | Behavior                                                                                                                            |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `q`                                                                  | Trimmed literal substring in make, model, mapped variant, or external vehicle ID. Empty or whitespace-only input applies no search. |
| `make`, `model`, `fuelType`, `transmission`, `condition`, `bodyType` | Trimmed literal substring.                                                                                                          |
| `availability`                                                       | Full source status value, such as `Available`.                                                                                      |
| `minPrice`, `maxPrice`                                               | Inclusive nonnegative decimal strings with up to two fractional digits and 32 characters.                                           |
| `minYear`, `maxYear`                                                 | Inclusive integer bounds from 1886 to 2100.                                                                                         |
| `minMileage`, `maxMileage`                                           | Inclusive nonnegative integer bounds up to JavaScript's maximum safe integer. Units come from the inventory source.                 |
| `sort`                                                               | `newest` (default), `priceAsc`, `priceDesc`, `yearAsc`, `yearDesc`, `mileageAsc`, `mileageDesc`, `makeAsc`, or `makeDesc`.          |
| `page`, `pageSize`                                                   | One-based page (default 1, maximum 10,000). Page size defaults to 20 and accepts 1 through 100.                                     |

Example requests:

```http
GET /api/v1/inventory/vehicles?q=Toyota&minPrice=3000000&maxPrice=10000000&availability=Available&sort=priceAsc&page=1&pageSize=20
GET /api/v1/inventory/vehicles?minMileage=0&maxMileage=35000&condition=Used&sort=yearDesc&pageSize=10
```

Search and filters are combined with AND, with OR across search fields. Comparisons follow the MySQL column collation, including case-insensitivity where configured. Percent, underscore, and the escape character are matched literally. Leading-wildcard queries can scan matching source rows. Description is outside the existing search contract.

An inverted range or an explicit filter or sort against an unmapped column returns HTTP 400. The response includes `supportedFilters` for optional dashboard controls. NULL facts stay NULL and are excluded when a filter requires a value for that field. Sorts place NULL values last in both directions. The configured unique primary key breaks ties in descending order. The default sorts by year descending when mapped, otherwise by primary key descending.

The response contains `items`, `total`, `page`, `pageSize`, `totalPages`, and `supportedFilters`. Zero matches produce zero pages. A request past the last page returns an empty item list and the matching count. MySQL applies the same predicates to the count and the bounded row query within a read-only repeatable-read transaction. InnoDB supports a consistent snapshot within that request. Separate page requests may observe source updates.

The connector verifies reader grants, checks both SELECT statements, binds user values, and applies timeouts. Fixed transaction controls run on the verified session. The connection remains subject to the existing public-host TLS and destination checks.

For local verification, load the existing ignored application and fixture environments, set both integration flags described above, and run the existing workspace test script with `--env-mode=loose --force` to forward those flags and avoid an earlier cached result. The database integration suite also expects `DATABASE_URL` to point to the local migration owner connection. The inventory API integration test expects all 16 synthetic records and exercises search, filters, counts, sorting, pagination, tenant boundaries, and read-only access.

## Hosted database setup

1. Create a dedicated MySQL account for Carvix. Restrict its MySQL host pattern to the
   Carvix deployment's stable egress IP where the provider supports that restriction,
   require TLS, and grant only `SELECT` on the dealership inventory database or required
   inventory view. Do not reuse an administrator account.
2. Allow inbound traffic at the database firewall only from the Carvix static egress
   addresses on the provider's MySQL port. Configure deployment egress rules so Carvix
   can reach only approved customer database endpoints or an approved egress proxy; deny
   loopback, private, link-local, metadata, and internal service ranges. For DNS-managed
   endpoints, keep firewall allowlists aligned with provider address changes. Configure
   the approved CA bundle before testing if the provider requires one.
3. In Inventory Settings, enter the provider's DNS endpoint when available, its port,
   database, reader username/password, and actual table/column names. Keep **Require
   TLS** enabled. For a literal public IP, also enter the DNS name on the certificate.
   Re-enter the password when changing the endpoint, its IP certificate identity, or the username.
4. Save the mapping, test the connection, verify the source fields, and activate only
   after the test succeeds. Carvix validates every DNS answer and pins its socket to a
   vetted public IP; network egress controls remain required as a second boundary.

Day 8 inspected the isolated hosted-test PostgreSQL record for the Enzonic inventory mapping. It reported ACTIVE and recorded an earlier successful connection test. Day 8 hosted search remains unverified by a live MySQL request.
