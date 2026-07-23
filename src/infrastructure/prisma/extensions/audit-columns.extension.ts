/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
import { Prisma } from '@prisma/client';
import { TenantContextService } from '../../../common/context/tenant-context.js';
import { convertToSoftDelete } from '../../../common/utils/soft-delete.js';

export function auditColumnsExtension(
  tenantContextService: TenantContextService,
  tenantScopedModels: ReadonlySet<string>,
) {
  return Prisma.defineExtension((client) => {
    return client.$extends({
      name: 'auditColumns',
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            if (!model || tenantScopedModels.has(model)) {
              return query(args);
            }

            const ctx = tenantContextService.getStore();
            const userId = ctx?.userId ?? null;

            if (!userId) {
              return query(args);
            }

            const modified = { ...(args as Record<string, unknown>) };

            switch (operation) {
              case 'create': {
                const data = {
                  ...((modified.data as Record<string, unknown>) ?? {}),
                };
                data.createdById = userId;
                modified.data = data;
                break;
              }
              case 'createMany': {
                const rawData = modified.data as
                  Record<string, unknown>[] | Record<string, unknown>;
                if (Array.isArray(rawData)) {
                  modified.data = rawData.map((item) => ({
                    ...item,
                    createdById: userId,
                  }));
                } else if (rawData) {
                  modified.data = {
                    ...rawData,
                    createdById: userId,
                  };
                }
                break;
              }
              case 'update':
              case 'updateMany': {
                const data = {
                  ...((modified.data as Record<string, unknown>) ?? {}),
                };
                data.updatedById = userId;
                modified.data = data;
                break;
              }
              case 'upsert': {
                const create = {
                  ...((modified.create as Record<string, unknown>) ?? {}),
                };
                create.createdById = userId;
                modified.create = create;

                const update = {
                  ...((modified.update as Record<string, unknown>) ?? {}),
                };
                update.updatedById = userId;
                modified.update = update;
                break;
              }
              case 'delete':
              case 'deleteMany': {
                const softDeleteArgs = convertToSoftDelete(modified, userId);
                const actualOperation =
                  operation === 'delete' ? 'update' : 'updateMany';
                return (client as any)[model][actualOperation](softDeleteArgs);
              }
            }

            return query(modified);
          },
        },
      },
    });
  });
}
