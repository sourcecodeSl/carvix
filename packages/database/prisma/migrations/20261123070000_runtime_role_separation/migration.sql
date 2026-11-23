DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aicrm_auth') THEN
    CREATE ROLE "aicrm_auth"
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;
  ELSE
    ALTER ROLE "aicrm_auth"
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;
  END IF;
END
$$;

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
  ELSE
    ALTER ROLE "aicrm_app"
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO "aicrm_auth";
GRANT SELECT, INSERT, UPDATE ON "auth_sessions" TO "aicrm_auth";
GRANT SELECT ON "users" TO "aicrm_auth";
GRANT SELECT ON "password_credentials" TO "aicrm_auth";

GRANT USAGE ON SCHEMA public TO "aicrm_app";
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "dealerships",
  "branches",
  "tenant_memberships"
TO "aicrm_app";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aicrm_auth_runtime') THEN
    GRANT "aicrm_auth" TO "aicrm_auth_runtime";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aicrm_app_runtime') THEN
    GRANT "aicrm_app" TO "aicrm_app_runtime";
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.auth_active_memberships(p_user_id uuid)
RETURNS TABLE (
  membership_id uuid,
  tenant_id uuid,
  tenant_name text,
  role "MembershipRole",
  membership_status "MembershipStatus",
  tenant_status "TenantStatus"
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    tm.id,
    tm.tenant_id,
    t.name,
    tm.role,
    tm.status,
    t.status
  FROM public.tenant_memberships tm
  JOIN public.tenants t ON t.id = tm.tenant_id
  WHERE tm.user_id = p_user_id
    AND tm.status = 'ACTIVE'
    AND t.status = 'ACTIVE';
$$;

CREATE OR REPLACE FUNCTION public.auth_platform_administrator(p_user_id uuid)
RETURNS TABLE (
  role "PlatformRole",
  status "PlatformAdministratorStatus"
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT pa.role, pa.status
  FROM public.platform_administrators pa
  WHERE pa.user_id = p_user_id
    AND pa.status = 'ACTIVE';
$$;

REVOKE ALL ON FUNCTION public.auth_active_memberships(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_platform_administrator(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_active_memberships(uuid) TO "aicrm_auth";
GRANT EXECUTE ON FUNCTION public.auth_platform_administrator(uuid) TO "aicrm_auth";
