-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('DEALER_ADMIN', 'SALES_MANAGER', 'SALES_AGENT');

-- CreateEnum
CREATE TYPE "BranchStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "PlatformAdministratorStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TenantStatus" ADD VALUE 'PENDING';
ALTER TYPE "TenantStatus" ADD VALUE 'INACTIVE';

-- CreateTable
CREATE TABLE "dealerships" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "business_name" TEXT NOT NULL,
    "contact_email" TEXT NOT NULL,
    "contact_phone" TEXT,
    "country" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dealerships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "dealership_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "phone" TEXT,
    "status" "BranchStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_memberships" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'INVITED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_administrators" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "PlatformRole" NOT NULL DEFAULT 'SUPER_ADMIN',
    "status" "PlatformAdministratorStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_administrators_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dealerships_tenant_id_key" ON "dealerships"("tenant_id");

-- CreateIndex
CREATE INDEX "dealerships_tenant_id_idx" ON "dealerships"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "dealerships_id_tenant_id_key" ON "dealerships"("id", "tenant_id");

-- CreateIndex
CREATE INDEX "branches_tenant_id_idx" ON "branches"("tenant_id");

-- CreateIndex
CREATE INDEX "branches_dealership_id_idx" ON "branches"("dealership_id");

-- CreateIndex
CREATE UNIQUE INDEX "branches_dealership_id_code_key" ON "branches"("dealership_id", "code");

-- CreateIndex
CREATE INDEX "tenant_memberships_tenant_id_idx" ON "tenant_memberships"("tenant_id");

-- CreateIndex
CREATE INDEX "tenant_memberships_user_id_idx" ON "tenant_memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_memberships_user_id_tenant_id_key" ON "tenant_memberships"("user_id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_administrators_user_id_key" ON "platform_administrators"("user_id");

-- CreateIndex
CREATE INDEX "platform_administrators_status_idx" ON "platform_administrators"("status");

-- AddForeignKey
ALTER TABLE "dealerships" ADD CONSTRAINT "dealerships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_dealership_id_tenant_id_fkey" FOREIGN KEY ("dealership_id", "tenant_id") REFERENCES "dealerships"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_administrators" ADD CONSTRAINT "platform_administrators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Day 2 tenant isolation foundation.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aicrm_app') THEN
    CREATE ROLE "aicrm_app"
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO "aicrm_app";
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "dealerships",
  "branches",
  "tenant_memberships"
TO "aicrm_app";

ALTER TABLE "dealerships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dealerships" FORCE ROW LEVEL SECURITY;
ALTER TABLE "branches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "branches" FORCE ROW LEVEL SECURITY;
ALTER TABLE "tenant_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenant_memberships" FORCE ROW LEVEL SECURITY;

CREATE POLICY "dealerships_tenant_isolation"
ON "dealerships"
USING (
  NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
  AND "tenant_id"::text = current_setting('app.tenant_id', true)
)
WITH CHECK (
  NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
  AND "tenant_id"::text = current_setting('app.tenant_id', true)
);

CREATE POLICY "branches_tenant_isolation"
ON "branches"
USING (
  NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
  AND "tenant_id"::text = current_setting('app.tenant_id', true)
)
WITH CHECK (
  NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
  AND "tenant_id"::text = current_setting('app.tenant_id', true)
);

CREATE POLICY "tenant_memberships_tenant_isolation"
ON "tenant_memberships"
USING (
  NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
  AND "tenant_id"::text = current_setting('app.tenant_id', true)
)
WITH CHECK (
  NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
  AND "tenant_id"::text = current_setting('app.tenant_id', true)
);
