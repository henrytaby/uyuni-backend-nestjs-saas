-- CreateEnum
CREATE TYPE "ChangeAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- AlterTable
ALTER TABLE "permissions" ADD COLUMN     "created_by_id" UUID,
ADD COLUMN     "deleted_by_id" UUID,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "updated_by_id" UUID;

-- AlterTable
ALTER TABLE "role_assignments" ADD COLUMN     "created_by_id" UUID,
ADD COLUMN     "deleted_by_id" UUID,
ADD COLUMN     "updated_by_id" UUID;

-- CreateTable
CREATE TABLE "access_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "method" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "ip" TEXT NOT NULL,
    "user_agent" TEXT,
    "user_id" UUID,
    "tenant_id" UUID,
    "request_id" TEXT NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" "ChangeAction" NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB,
    "actor_id" UUID,
    "tenant_id" UUID,
    "request_id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "change_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "access_logs_tenant_id_timestamp_idx" ON "access_logs"("tenant_id", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "access_logs_request_id_idx" ON "access_logs"("request_id");

-- CreateIndex
CREATE INDEX "access_logs_user_id_timestamp_idx" ON "access_logs"("user_id", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "change_records_tenant_id_entity_type_entity_id_idx" ON "change_records"("tenant_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "change_records_request_id_idx" ON "change_records"("request_id");

-- CreateIndex
CREATE INDEX "change_records_tenant_id_timestamp_idx" ON "change_records"("tenant_id", "timestamp" DESC);

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "access_logs" ADD CONSTRAINT "access_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_records" ADD CONSTRAINT "change_records_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_records" ADD CONSTRAINT "change_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
