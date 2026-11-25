CREATE TYPE "AuditEventCategory" AS ENUM (
  'AUTHENTICATION',
  'AUTHORIZATION',
  'DEALERSHIP',
  'BRANCH',
  'STAFF',
  'INVITATION',
  'SECURITY',
  'SYSTEM'
);

CREATE TYPE "AuditEventOutcome" AS ENUM ('SUCCESS', 'FAILURE', 'DENIED');

CREATE TABLE "audit_events" (
  "id" UUID NOT NULL,
  "tenant_id" UUID,
  "actor_user_id" UUID,
  "actor_membership_id" UUID,
  "event_type" TEXT NOT NULL,
  "category" "AuditEventCategory" NOT NULL,
  "action" TEXT NOT NULL,
  "resource_type" TEXT NOT NULL,
  "resource_id" TEXT,
  "outcome" "AuditEventOutcome" NOT NULL,
  "request_id" TEXT,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "metadata" JSONB,
  "schema_version" INTEGER NOT NULL DEFAULT 1,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_events_event_type_format_check"
    CHECK ("event_type" ~ '^[a-z][a-z0-9_.-]{2,127}$'),
  CONSTRAINT "audit_events_action_format_check"
    CHECK (length("action") BETWEEN 1 AND 64),
  CONSTRAINT "audit_events_resource_type_format_check"
    CHECK (length("resource_type") BETWEEN 1 AND 64),
  CONSTRAINT "audit_events_resource_id_format_check"
    CHECK ("resource_id" IS NULL OR length("resource_id") <= 128),
  CONSTRAINT "audit_events_request_id_format_check"
    CHECK ("request_id" IS NULL OR length("request_id") <= 128),
  CONSTRAINT "audit_events_ip_format_check"
    CHECK ("ip_address" IS NULL OR length("ip_address") <= 64),
  CONSTRAINT "audit_events_user_agent_format_check"
    CHECK ("user_agent" IS NULL OR length("user_agent") <= 256),
  CONSTRAINT "audit_events_metadata_format_check"
    CHECK ("metadata" IS NULL OR octet_length("metadata"::text) <= 8192),
  CONSTRAINT "audit_events_tenant_actor_consistency_check"
    CHECK (
      ("tenant_id" IS NULL AND "actor_membership_id" IS NULL)
      OR ("tenant_id" IS NOT NULL)
    )
);

CREATE INDEX "audit_events_tenant_occurred_id_idx"
  ON "audit_events"("tenant_id", "occurred_at" DESC, "id");
CREATE INDEX "audit_events_tenant_event_occurred_idx"
  ON "audit_events"("tenant_id", "event_type", "occurred_at" DESC);
CREATE INDEX "audit_events_tenant_actor_occurred_idx"
  ON "audit_events"("tenant_id", "actor_user_id", "occurred_at" DESC);
CREATE INDEX "audit_events_tenant_category_outcome_idx"
  ON "audit_events"("tenant_id", "category", "outcome", "occurred_at" DESC);

ALTER TABLE "audit_events"
  ADD CONSTRAINT "audit_events_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_events_tenant_scope ON "audit_events"
  USING (
    current_user IN ('aicrm_auth', 'aicrm_auth_runtime')
    OR (
      "tenant_id" IS NOT NULL
      AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
      AND "tenant_id"::text = current_setting('app.tenant_id', true)
    )
  )
  WITH CHECK (
    current_user IN ('aicrm_auth', 'aicrm_auth_runtime')
    OR (
      "tenant_id" IS NOT NULL
      AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
      AND "tenant_id"::text = current_setting('app.tenant_id', true)
    )
  );

REVOKE ALL ON "audit_events" FROM PUBLIC;
GRANT SELECT, INSERT ON "audit_events" TO "aicrm_app";
GRANT INSERT ON "audit_events" TO "aicrm_auth";

CREATE OR REPLACE FUNCTION public.audit_record_auth_event(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_actor_membership_id uuid,
  p_event_type text,
  p_category "AuditEventCategory",
  p_action text,
  p_resource_type text,
  p_resource_id text,
  p_outcome "AuditEventOutcome",
  p_request_id text,
  p_ip_address text,
  p_user_agent text,
  p_metadata jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  event_id uuid := gen_random_uuid();
BEGIN
  IF p_event_type NOT IN (
    'auth.login.success',
    'auth.login.failure',
    'auth.logout',
    'auth.tenant.switched',
    'staff.invitation.accepted'
  ) THEN
    RAISE EXCEPTION 'Event type is not allowed for authentication audit writes';
  END IF;

  IF p_actor_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.users AS usr WHERE usr.id = p_actor_user_id
  ) THEN
    RAISE EXCEPTION 'Actor user does not exist';
  END IF;

  IF p_tenant_id IS NOT NULL AND p_actor_membership_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.tenant_memberships AS membership
      WHERE membership.id = p_actor_membership_id
        AND membership.tenant_id = p_tenant_id
        AND membership.user_id = p_actor_user_id
    )
  THEN
    RAISE EXCEPTION 'Actor membership does not belong to the tenant';
  END IF;

  IF p_metadata IS NOT NULL AND octet_length(p_metadata::text) > 8192 THEN
    RAISE EXCEPTION 'Audit metadata exceeds the allowed size';
  END IF;

  INSERT INTO public.audit_events (
    id, tenant_id, actor_user_id, actor_membership_id,
    event_type, category, action, resource_type, resource_id,
    outcome, request_id, ip_address, user_agent, metadata,
    schema_version, occurred_at
  )
  VALUES (
    event_id, p_tenant_id, p_actor_user_id, p_actor_membership_id,
    p_event_type, p_category, p_action, p_resource_type, p_resource_id,
    p_outcome, NULLIF(left(p_request_id, 128), ''),
    NULLIF(left(p_ip_address, 64), ''), NULLIF(left(p_user_agent, 256), ''),
    p_metadata, 1, statement_timestamp()
  );

  RETURN event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_record_auth_event(
  uuid, uuid, uuid, text, "AuditEventCategory", text, text, text,
  "AuditEventOutcome", text, text, text, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_record_auth_event(
  uuid, uuid, uuid, text, "AuditEventCategory", text, text, text,
  "AuditEventOutcome", text, text, text, jsonb
) TO "aicrm_auth";
