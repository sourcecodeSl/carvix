REVOKE ALL ON TABLE "auth_sessions" FROM "aicrm_auth";
REVOKE ALL ON TABLE "auth_sessions" FROM "aicrm_auth_runtime";

GRANT INSERT (
  "id",
  "user_id",
  "token_hash",
  "active_tenant_id",
  "expires_at",
  "revoked_at",
  "created_at",
  "last_used_at"
) ON "auth_sessions" TO "aicrm_auth";

GRANT UPDATE (
  "active_tenant_id",
  "expires_at",
  "revoked_at",
  "last_used_at"
) ON "auth_sessions" TO "aicrm_auth";

CREATE OR REPLACE FUNCTION public.auth_session_for_token(p_session_token_hash text)
RETURNS TABLE (
  session_id uuid,
  user_id uuid,
  active_tenant_id uuid,
  expires_at timestamp(3),
  revoked_at timestamp(3),
  user_status "UserStatus"
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT s.id, s.user_id, s.active_tenant_id, s.expires_at, s.revoked_at, u.status
  FROM public.auth_sessions s
  JOIN public.users u ON u.id = s.user_id
  WHERE length(p_session_token_hash) = 64
    AND p_session_token_hash ~ '^[0-9a-f]{64}$'
    AND s.token_hash = p_session_token_hash;
$$;

REVOKE ALL ON FUNCTION public.auth_session_for_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_session_for_token(text) TO "aicrm_auth";

GRANT EXECUTE ON FUNCTION public.auth_active_memberships(text) TO "aicrm_auth_runtime";
GRANT EXECUTE ON FUNCTION public.auth_platform_administrator(text) TO "aicrm_auth_runtime";
