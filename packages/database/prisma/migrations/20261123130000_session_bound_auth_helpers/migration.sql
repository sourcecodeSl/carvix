CREATE OR REPLACE FUNCTION public.auth_active_memberships(p_session_token_hash text)
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
  SELECT tm.id, tm.tenant_id, t.name, tm.role, tm.status, t.status
  FROM public.auth_sessions s
  JOIN public.users u ON u.id = s.user_id
  JOIN public.tenant_memberships tm ON tm.user_id = u.id
  JOIN public.tenants t ON t.id = tm.tenant_id
  WHERE length(p_session_token_hash) = 64
    AND p_session_token_hash ~ '^[0-9a-f]{64}$'
    AND s.token_hash = p_session_token_hash
    AND s.revoked_at IS NULL
    AND s.expires_at > CURRENT_TIMESTAMP
    AND u.status = 'ACTIVE'
    AND tm.status = 'ACTIVE'
    AND t.status = 'ACTIVE';
$$;

CREATE OR REPLACE FUNCTION public.auth_platform_administrator(p_session_token_hash text)
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
  FROM public.auth_sessions s
  JOIN public.users u ON u.id = s.user_id
  JOIN public.platform_administrators pa ON pa.user_id = u.id
  WHERE length(p_session_token_hash) = 64
    AND p_session_token_hash ~ '^[0-9a-f]{64}$'
    AND s.token_hash = p_session_token_hash
    AND s.revoked_at IS NULL
    AND s.expires_at > CURRENT_TIMESTAMP
    AND u.status = 'ACTIVE'
    AND pa.status = 'ACTIVE';
$$;

REVOKE ALL ON FUNCTION public.auth_active_memberships(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_platform_administrator(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_active_memberships(text) TO "aicrm_auth";
GRANT EXECUTE ON FUNCTION public.auth_platform_administrator(text) TO "aicrm_auth";
