ALTER TABLE "inventory_connections"
  ADD COLUMN "configuration_revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "last_tested_revision" INTEGER;

ALTER TABLE "inventory_connections"
  ADD CONSTRAINT "inventory_connections_configuration_revision_check"
    CHECK ("configuration_revision" > 0),
  ADD CONSTRAINT "inventory_connections_last_tested_revision_check"
    CHECK ("last_tested_revision" IS NULL OR "last_tested_revision" <= "configuration_revision");