-- Revoke UPDATE and DELETE on append-only tables from the application role
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'application_role') THEN
    EXECUTE 'REVOKE UPDATE, DELETE ON "access_logs" FROM application_role';
    EXECUTE 'REVOKE UPDATE, DELETE ON "change_records" FROM application_role';
  END IF;
END
$$;