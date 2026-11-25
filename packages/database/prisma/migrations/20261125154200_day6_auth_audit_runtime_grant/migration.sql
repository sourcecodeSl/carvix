GRANT EXECUTE ON FUNCTION public.audit_record_auth_event(
  uuid,
  uuid,
  uuid,
  text,
  "AuditEventCategory",
  text,
  text,
  text,
  "AuditEventOutcome",
  text,
  text,
  text,
  jsonb
) TO "aicrm_auth_runtime";
