CREATE OR REPLACE FUNCTION public.audit_record_auth_event(
  p_session_token_hash text,
  p_event_type text,
  p_target_tenant_id uuid,
  p_action text,
  p_resource_type text,
  p_resource_id text,
  p_outcome "AuditEventOutcome",
  p_request_id text,
  p_ip_address text,
  p_user_agent text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  event_id uuid := gen_random_uuid();
  session_row record;
  actor_user_id uuid;
  actor_membership_id uuid;
  resolved_tenant_id uuid;
BEGIN
  IF p_event_type = 'auth.login.failure' THEN
    IF p_session_token_hash IS NOT NULL
      OR p_target_tenant_id IS NOT NULL
      OR p_outcome <> 'FAILURE'
    THEN
      RAISE EXCEPTION 'Invalid pre-authentication audit context';
    END IF;

    INSERT INTO public.audit_events (
      id, tenant_id, actor_user_id, actor_membership_id,
      event_type, category, action, resource_type, resource_id,
      outcome, request_id, ip_address, user_agent,
      metadata, schema_version, occurred_at
    )
    VALUES (
      event_id, NULL, NULL, NULL,
      p_event_type, 'AUTHENTICATION', p_action, p_resource_type, p_resource_id,
      p_outcome, NULLIF(left(p_request_id, 128), ''),
      NULLIF(left(p_ip_address, 64), ''), NULLIF(left(p_user_agent, 256), ''),
      NULL, 1, statement_timestamp()
    );
    RETURN event_id;
  END IF;

  IF p_event_type NOT IN (
    'auth.login.success',
    'auth.logout',
    'auth.tenant.switched'
  ) THEN
    RAISE EXCEPTION 'Event type is not allowed for authentication audit writes';
  END IF;

  IF p_session_token_hash IS NULL
    OR p_session_token_hash !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'A valid session token hash is required';
  END IF;

  SELECT
    resolved.session_id,
    resolved.user_id,
    resolved.active_tenant_id,
    resolved.revoked_at,
    resolved.expires_at
  INTO session_row
  FROM public.auth_session_for_token(p_session_token_hash) AS resolved
  WHERE resolved.revoked_at IS NULL
    AND resolved.expires_at > statement_timestamp();

  IF session_row IS NULL THEN
    RAISE EXCEPTION 'The audit event session is not active';
  END IF;

  actor_user_id := session_row.user_id;
  resolved_tenant_id := CASE
    WHEN p_event_type = 'auth.tenant.switched' THEN p_target_tenant_id
    ELSE session_row.active_tenant_id
  END;

  IF p_event_type = 'auth.tenant.switched'
    AND p_target_tenant_id IS NULL
  THEN
    RAISE EXCEPTION 'Tenant switch requires a target tenant';
  END IF;

  IF resolved_tenant_id IS NOT NULL THEN
    SELECT membership.id
    INTO actor_membership_id
    FROM public.tenant_memberships AS membership
    WHERE membership.user_id = actor_user_id
      AND membership.tenant_id = resolved_tenant_id
      AND membership.status = 'ACTIVE';
  END IF;

  IF p_event_type = 'auth.tenant.switched'
    AND actor_membership_id IS NULL
  THEN
    RAISE EXCEPTION 'The target tenant is not authorized';
  END IF;

  INSERT INTO public.audit_events (
    id, tenant_id, actor_user_id, actor_membership_id,
    event_type, category, action, resource_type, resource_id,
    outcome, request_id, ip_address, user_agent,
    metadata, schema_version, occurred_at
  )
  VALUES (
    event_id, resolved_tenant_id, actor_user_id, actor_membership_id,
    p_event_type, 'AUTHENTICATION', p_action, p_resource_type, p_resource_id,
    p_outcome, NULLIF(left(p_request_id, 128), ''),
    NULLIF(left(p_ip_address, 64), ''), NULLIF(left(p_user_agent, 256), ''),
    NULL, 1, statement_timestamp()
  );

  RETURN event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_record_auth_event(
  text, text, uuid, text, text, text, "AuditEventOutcome", text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_record_auth_event(
  text, text, uuid, text, text, text, "AuditEventOutcome", text, text, text
) FROM "aicrm_auth";
GRANT EXECUTE ON FUNCTION public.audit_record_auth_event(
  text, text, uuid, text, text, text, "AuditEventOutcome", text, text, text
) TO "aicrm_auth_runtime";
