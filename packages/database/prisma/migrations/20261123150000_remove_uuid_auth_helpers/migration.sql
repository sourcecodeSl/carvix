DROP FUNCTION IF EXISTS public.auth_active_memberships(uuid);
DROP FUNCTION IF EXISTS public.auth_platform_administrator(uuid);

REVOKE ALL ON FUNCTION public.auth_active_memberships(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_platform_administrator(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_active_memberships(text) TO "aicrm_auth";
GRANT EXECUTE ON FUNCTION public.auth_platform_administrator(text) TO "aicrm_auth";
