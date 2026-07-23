-- Drop the Prisma-generated unique constraints
DROP INDEX IF EXISTS "users_email_key";
DROP INDEX IF EXISTS "tenants_slug_key";
DROP INDEX IF EXISTS "roles_tenant_id_name_key";

-- Create partial unique indexes to allow multiple soft-deleted records with the same value
CREATE UNIQUE INDEX "unique_active_email" ON "users" ("email") WHERE is_active = true;
CREATE UNIQUE INDEX "unique_active_slug" ON "tenants" ("slug") WHERE is_active = true;
CREATE UNIQUE INDEX "unique_active_role_tenant" ON "roles" ("tenant_id", "name") WHERE is_active = true;