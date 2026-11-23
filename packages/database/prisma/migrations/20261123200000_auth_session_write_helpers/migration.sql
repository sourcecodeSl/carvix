CREATE OR REPLACE FUNCTION public.auth_create_session(
  p_user_id uuid,
  p_token_hash text,
  p_active_tenant_id uuid,
  p_expires_at timestamp(3)
)
RETURNS uuid
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  INSERT INTO public.auth_sessions (
    id,
    user_id,
    token_hash,
    active_tenant_id,
    expires_at,
    revoked_at,
    created_at,
    last_used_at
  )
  SELECT
    gen_random_uuid(),
    p_user_id,
    p_token_hash,
    p_active_tenant_id,
    p_expires_at,
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  WHERE length(p_token_hash) = 64
    AND p_token_hash ~ '^[0-9a-f]{64}$'
  RETURNING id;
$$;

CREATE OR REPLACE FUNCTION public.auth_revoke_session(p_token_hash text)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  UPDATE public.auth_sessions
  SET revoked_at = CURRENT_TIMESTAMP
  WHERE token_hash = p_token_hash
    AND length(p_token_hash) = 64
    AND p_token_hash ~ '^[0-9a-f]{64}$'
  RETURNING true;
$$;

CREATE OR REPLACE FUNCTION public.auth_touch_session(p_token_hash text)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  UPDATE public.auth_sessions
  SET last_used_at = CURRENT_TIMESTAMP
  WHERE token_hash = p_token_hash
    AND revoked_at IS NULL
    AND expires_at > CURRENT_TIMESTAMP
    AND length(p_token_hash) = 64
    AND p_token_hash ~ '^[0-9a-f]{64}$'
  RETURNING true;
$$;

CREATE OR REPLACE FUNCTION public.auth_set_active_tenant(
  p_session_id uuid,
  p_tenant_id uuid
)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  UPDATE public.auth_sessions
  SET active_tenant_id = p_tenant_id
  WHERE id = p_session_id
    AND revoked_at IS NULL
    AND expires_at > CURRENT_TIMESTAMP
  RETURNING true;
$$;

REVOKE ALL ON FUNCTION public.auth_create_session(uuid,text,uuid,timestamp(3)) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_revoke_session(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_touch_session(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_set_active_tenant(uuid,uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.auth_create_session(uuid,text,uuid,timestamp(3)) TO "aicrm_auth";
GRANT EXECUTE ON FUNCTION public.auth_revoke_session(text) TO "aicrm_auth";
GRANT EXECUTE ON FUNCTION public.auth_touch_session(text) TO "aicrm_auth";
GRANT EXECUTE ON FUNCTION public.auth_set_active_tenant(uuid,uuid) TO "aicrm_auth";

GRANT EXECUTE ON FUNCTION public.auth_create_session(uuid,text,uuid,timestamp(3)) TO "aicrm_auth_runtime";
GRANT EXECUTE ON FUNCTION public.auth_revoke_session(text) TO "aicrm_auth_runtime";
GRANT EXECUTE ON FUNCTION public.auth_touch_session(text) TO "aicrm_auth_runtime";
GRANT EXECUTE ON FUNCTION public.auth_set_active_tenant(uuid,uuid) TO "aicrm_auth_runtime";
