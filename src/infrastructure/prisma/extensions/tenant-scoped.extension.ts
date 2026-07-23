/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
import { AsyncLocalStorage } from 'node:async_hooks';
import { InternalServerErrorException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContextService } from '../../../common/context/tenant-context.js';

/**
 * Per-request flag indicating the current async context is already running
 * inside the tenant-scoped interactive transaction that issued `SET LOCAL`.
 * This lets the extension detect re-entry when `tx[model][operation]` is
 * invoked inside `$transaction` (which re-triggers `$allOperations`) and
 * avoid nested transactions / double `SET LOCAL`.
 */
const insideTenantTx = new AsyncLocalStorage<boolean>();

const WRITE_OPS = new Set([
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
]);

const READ_OPS = new Set(['findMany', 'findUnique', 'findFirst', 'count']);

/**
 * Builds the tenant-scoped Prisma Client Extensions.
 *
 * - `tenantScopedModels` is injected (Open/Closed: new modules register their
 *   models via the TENANT_SCOPED_MODELS token instead of editing a constant).
 * - Reads add a `WHERE tenant_id = ctx.tenantId` filter for non-admin callers.
 *   Because Prisma rejects extra `where` keys on `findUnique`, this operation
 *   is NOT supported on tenant-scoped models — it throws a controlled
 *   `InternalServerErrorException` directing callers to use `findFirst`
 *   (docs/tenancy.md "Extension Limitations").
 * - Writes inject `tenant_id` + audit FKs (`created_by_id` / `updated_by_id` /
 *   `deleted_by_id`) from the request context (bridge; full extension in 005).
 * - Every operation is wrapped in an interactive `$transaction` that issues
 *   `SET LOCAL app.tenant_id` (+ `app.is_platform_admin='true'` for bypass) so
 *   PostgreSQL RLS shares the same physical connection (research.md Task 3).
 */
export function tenantScopedExtension(
  tenantContextService: TenantContextService,
  tenantScopedModels: ReadonlySet<string>,
) {
  return Prisma.defineExtension((client) => {
    return client.$extends({
      name: 'tenantScoped',
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            if (!model || !tenantScopedModels.has(model)) {
              return query(args);
            }

            const ctx = tenantContextService.getStore();
            const tenantId = ctx?.tenantId ?? null;
            const userId = ctx?.userId ?? null;
            const isPlatformAdmin = ctx?.isPlatformAdmin ?? false;

            const isWrite = WRITE_OPS.has(operation);
            const isRead = READ_OPS.has(operation);

            let modifiedArgs = args as Record<string, unknown>;

            if (isWrite && tenantId) {
              modifiedArgs = injectWriteContext(
                modifiedArgs,
                operation,
                tenantId,
                userId,
              );
            }

            if (isRead && tenantId && !isPlatformAdmin) {
              if (operation === 'findUnique') {
                // findUnique cannot accept WHERE keys beyond the unique
                // selector; the isolation filter cannot be applied. Reject
                // with a controlled error (not a raw throw) and direct the
                // caller to findFirst. See docs/tenancy.md.
                throw new InternalServerErrorException(
                  `tenant-scoped extension: \`findUnique\` on "${model}" is ` +
                    `not supported because it cannot filter by tenant_id; ` +
                    `use \`findFirst({ where: { id } })\` instead.`,
                );
              }
              modifiedArgs = injectReadFilter(modifiedArgs, tenantId);
            }

            // Re-entry guard: already inside the tenant transaction that
            // issued SET LOCAL — run on the current (transactional) pipeline.
            if (insideTenantTx.getStore() === true) {
              return query(modifiedArgs);
            }

            // Wrap every tenant-scoped operation in an interactive
            // $transaction so SET LOCAL shares the same physical connection
            // (mandatory for RLS under Prisma connection pooling).
            return (client as any).$transaction(async (tx: any) => {
              if (tenantId) {
                await tx.$executeRaw`SET LOCAL app.tenant_id = ${tenantId}`;
              }
              if (isPlatformAdmin) {
                await tx.$executeRaw`SET LOCAL app.is_platform_admin = 'true'`;
              }
              // Re-enter the extension on the transactional client; the
              // insideTenantTx flag short-circuits to query(modifiedArgs),
              // which is now bound to `tx`.
              return insideTenantTx.run(true, () =>
                tx[model][operation](modifiedArgs),
              );
            });
          },
        },
      },
    });
  });
}

function injectWriteContext(
  args: Record<string, unknown>,
  action: string,
  tenantId: string,
  userId: string | null,
): Record<string, unknown> {
  const modified = { ...args };

  switch (action) {
    case 'create': {
      const data = { ...((modified.data as Record<string, unknown>) ?? {}) };
      data.tenantId = tenantId;
      if (userId) data.createdById = userId;
      modified.data = data;
      break;
    }
    case 'createMany': {
      const rawData = modified.data as
        Record<string, unknown>[] | Record<string, unknown>;
      if (Array.isArray(rawData)) {
        modified.data = rawData.map((item) => ({
          ...item,
          tenantId,
          ...(userId ? { createdById: userId } : {}),
        }));
      } else {
        modified.data = {
          ...rawData,
          tenantId,
          ...(userId ? { createdById: userId } : {}),
        };
      }
      break;
    }
    case 'update':
    case 'updateMany': {
      const data = { ...((modified.data as Record<string, unknown>) ?? {}) };
      if (userId) data.updatedById = userId;
      modified.data = data;
      const where = { ...((modified.where as Record<string, unknown>) ?? {}) };
      where.tenantId = tenantId;
      modified.where = where;
      break;
    }
    case 'upsert': {
      const where = { ...((modified.where as Record<string, unknown>) ?? {}) };
      where.tenantId = tenantId;
      modified.where = where;
      const create = {
        ...((modified.create as Record<string, unknown>) ?? {}),
      };
      create.tenantId = tenantId;
      if (userId) create.createdById = userId;
      modified.create = create;
      const update = {
        ...((modified.update as Record<string, unknown>) ?? {}),
      };
      if (userId) update.updatedById = userId;
      modified.update = update;
      break;
    }
    case 'delete':
    case 'deleteMany': {
      const where = { ...((modified.where as Record<string, unknown>) ?? {}) };
      where.tenantId = tenantId;
      modified.where = where;
      break;
    }
  }

  return modified;
}

function injectReadFilter(
  args: Record<string, unknown>,
  tenantId: string,
): Record<string, unknown> {
  const where = { ...((args.where as Record<string, unknown>) ?? {}) };
  where.tenantId = tenantId;
  return { ...args, where };
}
