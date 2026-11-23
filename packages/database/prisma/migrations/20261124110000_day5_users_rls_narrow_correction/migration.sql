DROP POLICY IF EXISTS users_tenant_scope ON "users";

CREATE POLICY users_tenant_scope ON "users"
  USING (
    pg_has_role(current_user, 'aicrm_auth', 'MEMBER')
    OR (
      pg_has_role(current_user, 'aicrm_app', 'MEMBER')
      AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
      AND "tenant_id"::text = current_setting('app.tenant_id', true)
    )
  )
  WITH CHECK (
    pg_has_role(current_user, 'aicrm_app', 'MEMBER')
    AND NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
    AND "tenant_id"::text = current_setting('app.tenant_id', true)
  );
