CREATE TYPE "StaffInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'CANCELLED', 'EXPIRED');

CREATE TABLE "staff_invitations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "invited_by_membership_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "status" "StaffInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_invitations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_invitations_email_normalized_check"
      CHECK ("email" <> '' AND "email" = lower(btrim("email"))),
    CONSTRAINT "staff_invitations_role_allowed_check"
      CHECK ("role" IN ('SALES_MANAGER', 'SALES_AGENT')),
    CONSTRAINT "staff_invitations_token_hash_format_check"
      CHECK ("token_hash" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "staff_invitation_branches" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "invitation_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_invitation_branches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "staff_branch_assignments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_branch_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_invitations_token_hash_key" ON "staff_invitations"("token_hash");
CREATE INDEX "staff_invitations_tenant_id_status_created_at_idx"
  ON "staff_invitations"("tenant_id", "status", "created_at");
CREATE INDEX "staff_invitations_tenant_id_email_status_idx"
  ON "staff_invitations"("tenant_id", "email", "status");
CREATE UNIQUE INDEX "staff_invitations_id_tenant_id_key"
  ON "staff_invitations"("id", "tenant_id");
CREATE INDEX "staff_invitation_branches_tenant_id_branch_id_idx"
  ON "staff_invitation_branches"("tenant_id", "branch_id");
CREATE UNIQUE INDEX "staff_invitation_branches_invitation_id_branch_id_key"
  ON "staff_invitation_branches"("invitation_id", "branch_id");
CREATE INDEX "staff_branch_assignments_tenant_id_branch_id_idx"
  ON "staff_branch_assignments"("tenant_id", "branch_id");
CREATE UNIQUE INDEX "staff_branch_assignments_membership_id_branch_id_key"
  ON "staff_branch_assignments"("membership_id", "branch_id");
CREATE UNIQUE INDEX "branches_id_tenant_id_key" ON "branches"("id", "tenant_id");
CREATE UNIQUE INDEX "tenant_memberships_id_tenant_id_key"
  ON "tenant_memberships"("id", "tenant_id");

ALTER TABLE "staff_invitations"
  ADD CONSTRAINT "staff_invitations_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_invitations"
  ADD CONSTRAINT "staff_invitations_invited_by_membership_id_tenant_id_fkey"
  FOREIGN KEY ("invited_by_membership_id", "tenant_id")
  REFERENCES "tenant_memberships"("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_invitation_branches"
  ADD CONSTRAINT "staff_invitation_branches_invitation_id_tenant_id_fkey"
  FOREIGN KEY ("invitation_id", "tenant_id")
  REFERENCES "staff_invitations"("id", "tenant_id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_invitation_branches"
  ADD CONSTRAINT "staff_invitation_branches_branch_id_tenant_id_fkey"
  FOREIGN KEY ("branch_id", "tenant_id") REFERENCES "branches"("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_branch_assignments"
  ADD CONSTRAINT "staff_branch_assignments_membership_id_tenant_id_fkey"
  FOREIGN KEY ("membership_id", "tenant_id")
  REFERENCES "tenant_memberships"("id", "tenant_id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_branch_assignments"
  ADD CONSTRAINT "staff_branch_assignments_branch_id_tenant_id_fkey"
  FOREIGN KEY ("branch_id", "tenant_id") REFERENCES "branches"("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
CREATE POLICY users_tenant_scope ON "users"
  USING (
    current_user IN ('aicrm_auth', 'aicrm_auth_runtime')
    OR (
      NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
      AND (
        "tenant_id"::text = current_setting('app.tenant_id', true)
        OR EXISTS (
          SELECT 1
          FROM public.tenant_memberships AS tm
          WHERE tm.user_id = "users".id
            AND tm.tenant_id::text = current_setting('app.tenant_id', true)
        )
      )
    )
  )
  WITH CHECK (
    NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
    AND "tenant_id"::text = current_setting('app.tenant_id', true)
  );

ALTER TABLE "staff_invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_invitations" FORCE ROW LEVEL SECURITY;
CREATE POLICY staff_invitations_tenant_scope ON "staff_invitations"
  USING ("tenant_id"::text = current_setting('app.tenant_id', true))
  WITH CHECK ("tenant_id"::text = current_setting('app.tenant_id', true));

ALTER TABLE "staff_invitation_branches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_invitation_branches" FORCE ROW LEVEL SECURITY;
CREATE POLICY staff_invitation_branches_tenant_scope ON "staff_invitation_branches"
  USING ("tenant_id"::text = current_setting('app.tenant_id', true))
  WITH CHECK ("tenant_id"::text = current_setting('app.tenant_id', true));

ALTER TABLE "staff_branch_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_branch_assignments" FORCE ROW LEVEL SECURITY;
CREATE POLICY staff_branch_assignments_tenant_scope ON "staff_branch_assignments"
  USING ("tenant_id"::text = current_setting('app.tenant_id', true))
  WITH CHECK ("tenant_id"::text = current_setting('app.tenant_id', true));

REVOKE ALL ON "staff_invitations", "staff_invitation_branches", "staff_branch_assignments" FROM PUBLIC;
REVOKE ALL ON "users" FROM PUBLIC;
GRANT SELECT ("id", "tenant_id", "email", "name", "status", "created_at", "updated_at")
  ON "users" TO "aicrm_app";
GRANT INSERT ("id", "tenant_id", "email", "name", "status", "created_at", "updated_at")
  ON "users" TO "aicrm_app";
GRANT UPDATE ("status", "updated_at") ON "users" TO "aicrm_app";
GRANT SELECT, INSERT, UPDATE ON "staff_invitations" TO "aicrm_app";
GRANT SELECT, INSERT ON "staff_invitation_branches" TO "aicrm_app";
GRANT SELECT, INSERT, DELETE ON "staff_branch_assignments" TO "aicrm_app";

CREATE OR REPLACE FUNCTION public.staff_resolve_invitation(p_token_hash text)
RETURNS TABLE (invitation_id uuid, tenant_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT invitation.id, invitation.tenant_id
    FROM public.staff_invitations AS invitation
    WHERE invitation.token_hash = p_token_hash
      AND invitation.status = 'PENDING'
      AND invitation.expires_at > statement_timestamp();
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_create_invited_password_credential(
  p_user_id uuid,
  p_password_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_tenant_id uuid;
  inserted_rows integer;
BEGIN
  IF p_user_id IS NULL
    OR p_password_hash IS NULL
    OR length(p_password_hash) < 50
    OR length(p_password_hash) > 1024
    OR p_password_hash !~ '^\$argon2id\$v=19\$m=[0-9]+,t=[0-9]+,p=[0-9]+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$'
  THEN
    RETURN false;
  END IF;

  current_tenant_id := NULLIF(current_setting('app.tenant_id', true), '')::uuid;
  IF current_tenant_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.users AS usr
    JOIN public.tenant_memberships AS membership
      ON membership.user_id = usr.id
    WHERE usr.id = p_user_id
      AND usr.tenant_id = current_tenant_id
      AND usr.status = 'INVITED'
      AND membership.tenant_id = current_tenant_id
      AND membership.status = 'INVITED'
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO public.password_credentials (
    id,
    user_id,
    password_hash,
    password_changed_at,
    created_at,
    updated_at
  )
  VALUES (
    gen_random_uuid(),
    p_user_id,
    p_password_hash,
    statement_timestamp(),
    statement_timestamp(),
    statement_timestamp()
  )
  ON CONFLICT (user_id) DO NOTHING;

  GET DIAGNOSTICS inserted_rows = ROW_COUNT;
  RETURN inserted_rows = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.staff_resolve_invitation(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_create_invited_password_credential(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_resolve_invitation(text) TO "aicrm_auth";
GRANT EXECUTE ON FUNCTION public.staff_create_invited_password_credential(uuid, text) TO "aicrm_app";
