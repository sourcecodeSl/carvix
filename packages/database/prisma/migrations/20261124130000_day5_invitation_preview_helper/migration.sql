CREATE OR REPLACE FUNCTION public.staff_resolve_invitation_preview(p_token_hash text)
RETURNS TABLE (
  invitation_id uuid,
  tenant_id uuid,
  email text,
  role "MembershipRole",
  tenant_name text,
  branches jsonb,
  expires_at timestamp(3)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    invitation.id,
    invitation.tenant_id,
    invitation.email,
    invitation.role,
    tenant.name,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', branch.id,
            'name', branch.name,
            'code', branch.code
          )
          ORDER BY branch.name, branch.code, branch.id
        )
        FROM public.staff_invitation_branches AS selection
        JOIN public.branches AS branch
          ON branch.id = selection.branch_id
         AND branch.tenant_id = invitation.tenant_id
        WHERE selection.invitation_id = invitation.id
          AND selection.tenant_id = invitation.tenant_id
      ),
      '[]'::jsonb
    ),
    invitation.expires_at
  FROM public.staff_invitations AS invitation
  JOIN public.tenants AS tenant
    ON tenant.id = invitation.tenant_id
  WHERE invitation.token_hash = p_token_hash
    AND invitation.status = 'PENDING'
    AND invitation.expires_at > statement_timestamp();
$$;

REVOKE ALL ON FUNCTION public.staff_resolve_invitation_preview(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_resolve_invitation_preview(text) TO "aicrm_auth";
GRANT EXECUTE ON FUNCTION public.staff_resolve_invitation_preview(text) TO "aicrm_auth_runtime";
