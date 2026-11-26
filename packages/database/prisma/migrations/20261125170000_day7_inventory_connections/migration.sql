CREATE TYPE "InventoryConnectionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ERROR');
CREATE TYPE "InventoryConnectorType" AS ENUM ('MYSQL');

CREATE TABLE "inventory_connections" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "dealership_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "connector_type" "InventoryConnectorType" NOT NULL DEFAULT 'MYSQL',
  "host" TEXT NOT NULL,
  "port" INTEGER NOT NULL DEFAULT 3306,
  "database_name" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "credential_ciphertext" TEXT NOT NULL,
  "credential_iv" TEXT NOT NULL,
  "credential_tag" TEXT NOT NULL,
  "credential_reference" TEXT NOT NULL,
  "status" "InventoryConnectionStatus" NOT NULL DEFAULT 'DRAFT',
  "tls_enabled" BOOLEAN NOT NULL DEFAULT true,
  "connect_timeout_ms" INTEGER NOT NULL DEFAULT 5000,
  "query_timeout_ms" INTEGER NOT NULL DEFAULT 5000,
  "last_tested_at" TIMESTAMP(3),
  "last_successful_connection_at" TIMESTAMP(3),
  "mapping" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "inventory_connections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_connections_name_format_check"
    CHECK (length(btrim("name")) BETWEEN 1 AND 100),
  CONSTRAINT "inventory_connections_host_format_check"
    CHECK ("host" <> '' AND length("host") <= 253),
  CONSTRAINT "inventory_connections_port_check"
    CHECK ("port" BETWEEN 1 AND 65535),
  CONSTRAINT "inventory_connections_database_format_check"
    CHECK ("database_name" ~ '^[A-Za-z_][A-Za-z0-9_$]{0,63}$'),
  CONSTRAINT "inventory_connections_username_format_check"
    CHECK ("username" <> '' AND length("username") <= 128),
  CONSTRAINT "inventory_connections_timeout_check"
    CHECK ("connect_timeout_ms" BETWEEN 500 AND 30000
      AND "query_timeout_ms" BETWEEN 500 AND 30000),
  CONSTRAINT "inventory_connections_ciphertext_format_check"
    CHECK ("credential_ciphertext" ~ '^[0-9a-f]+$'
      AND "credential_iv" ~ '^[0-9a-f]{24}$'
      AND "credential_tag" ~ '^[0-9a-f]{32}$')
);

CREATE UNIQUE INDEX "inventory_connections_dealership_name_key"
  ON "inventory_connections"("dealership_id", "name");
CREATE UNIQUE INDEX "inventory_connections_dealership_id_key"
  ON "inventory_connections"("dealership_id");
CREATE INDEX "inventory_connections_tenant_status_idx"
  ON "inventory_connections"("tenant_id", "status");
CREATE INDEX "inventory_connections_dealership_status_idx"
  ON "inventory_connections"("dealership_id", "status");

ALTER TABLE "inventory_connections"
  ADD CONSTRAINT "inventory_connections_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_connections"
  ADD CONSTRAINT "inventory_connections_dealership_tenant_id_fkey"
  FOREIGN KEY ("dealership_id", "tenant_id")
  REFERENCES "dealerships"("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_connections" FORCE ROW LEVEL SECURITY;

CREATE POLICY inventory_connections_tenant_scope ON "inventory_connections"
  USING (
    NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
    AND "tenant_id"::text = current_setting('app.tenant_id', true)
  )
  WITH CHECK (
    NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
    AND "tenant_id"::text = current_setting('app.tenant_id', true)
  );

REVOKE ALL ON "inventory_connections" FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON "inventory_connections" TO "aicrm_app";
