/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, no-useless-catch */
import { Prisma } from '@prisma/client';
import { Logger } from '@nestjs/common';
import { TenantContextService } from '../../../common/context/tenant-context.js';
import { redactSensitiveFields } from '../../../common/utils/redact-sensitive-fields.js';
import { AsyncLocalStorage } from 'node:async_hooks';

const insideCdcTx = new AsyncLocalStorage<boolean>();

export function cdcExtension(
  tenantContextService: TenantContextService,
  tenantScopedModels: ReadonlySet<string>,
) {
  const logger = new Logger('CdcExtension');

  return Prisma.defineExtension((client) => {
    return client.$extends({
      name: 'cdc',
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            if (
              (model as string) === 'ChangeRecord' ||
              (model as string) === 'AccessLog'
            ) {
              return query(args);
            }

            const WRITE_OPS = ['create', 'update', 'delete'];
            if (!model || !WRITE_OPS.includes(operation)) {
              return query(args);
            }

            if (insideCdcTx.getStore() === true) {
              return query(args);
            }

            const ctx = tenantContextService.getStore();
            const tenantId = ctx?.tenantId ?? null;
            const actorId = ctx?.userId ?? null;

            // Fallback for requestId if method doesn't exist
            let requestId = null;
            if (
              typeof (tenantContextService as any).getRequestId === 'function'
            ) {
              requestId = (tenantContextService as any).getRequestId();
            } else if (ctx && (ctx as any).requestId) {
              requestId = (ctx as any).requestId;
            }

            const executeMutationAndLog = async (
              txClient: any,
              mutationQuery: () => Promise<any>,
            ) => {
              let oldValue: Record<string, unknown> | null = null;
              const id = (args as any).where?.id;

              if ((operation === 'update' || operation === 'delete') && id) {
                try {
                  const result = await txClient[model].findFirst({
                    where: { id },
                  });
                  if (result) {
                    oldValue = redactSensitiveFields(
                      model,
                      result as Record<string, unknown>,
                    );
                  }
                } catch (e) {
                  logger.error(`CDC failed to fetch old_value for ${model}`, e);
                }
              }

              let result;
              try {
                result = await mutationQuery();
              } catch (e) {
                throw e;
              }

              try {
                let newValue: Record<string, unknown> | null = null;
                if (
                  result &&
                  (operation === 'create' ||
                    operation === 'update' ||
                    operation === 'delete')
                ) {
                  newValue = redactSensitiveFields(
                    model,
                    result as Record<string, unknown>,
                  );
                }

                await txClient.changeRecord.create({
                  data: {
                    entityType: model,
                    entityId: result?.id || id || 'unknown',
                    action: operation.toUpperCase(),
                    oldValue: oldValue ? (oldValue as any) : Prisma.DbNull,
                    newValue: newValue ? (newValue as any) : Prisma.DbNull,
                    actorId,
                    tenantId,
                    requestId,
                  },
                });
              } catch (e) {
                logger.error(
                  `CRITICAL: CDC failed to write ChangeRecord for ${model}`,
                  e,
                );
              }

              return result;
            };

            if (!tenantScopedModels.has(model)) {
              return (client as any).$transaction(async (tx: any) => {
                return insideCdcTx.run(true, () => {
                  return executeMutationAndLog(tx, () =>
                    tx[model][operation](args),
                  );
                });
              });
            } else {
              return executeMutationAndLog(client, () => query(args));
            }
          },
        },
      },
    });
  });
}
