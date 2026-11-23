REVOKE ALL ON FUNCTION public.auth_active_memberships(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_platform_administrator(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.auth_active_memberships(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_platform_administrator(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.auth_active_memberships(text) TO "aicrm_auth";
GRANT EXECUTE ON FUNCTION public.auth_platform_administrator(text) TO "aicrm_auth";


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
